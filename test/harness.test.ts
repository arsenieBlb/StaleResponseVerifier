import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { abortPrevious } from '../src/candidates/abortPrevious.ts';
import { guardSuccessOnly } from '../src/candidates/guardSuccessOnly.ts';
import { latestWins } from '../src/candidates/latestWins.ts';
import { naiveAwait } from '../src/candidates/naiveAwait.ts';
import { evaluateCandidate } from '../src/evaluate.ts';
import { interleavings, runScenario, scenarios } from '../src/harness.ts';
import type { Scenario } from '../src/harness.ts';

const space = [...scenarios()];

const catThenCats = (overrides: Partial<Scenario>): Scenario => ({
  id: 'cat-then-cats',
  queries: ['cat', 'cats'],
  outcomes: ['ok', 'ok'],
  abortMode: 'ignores-abort',
  events: [
    { kind: 'issue', request: 0 },
    { kind: 'issue', request: 1 },
    { kind: 'settle', request: 1 },
    { kind: 'settle', request: 0 },
  ],
  ...overrides,
});

describe('schedule enumeration', () => {
  test('produces every legal arrival order', () => {
    // (2n)! / 2^n orderings for n typed queries.
    assert.equal([...interleavings(2)].length, 3);
    assert.equal([...interleavings(3)].length, 15);
    assert.equal([...interleavings(4)].length, 105);
  });

  test('never settles a request before it is issued', () => {
    for (const events of interleavings(4)) {
      const issued = new Set<number>();
      for (const e of events) {
        if (e.kind === 'issue') issued.add(e.request);
        else assert.ok(issued.has(e.request));
      }
    }
  });

  test('covers outcomes and abort modes for 2-4 queries', () => {
    assert.equal(space.length, 2 * (3 * 4 + 15 * 8 + 105 * 16));
  });
});

describe('race detection', () => {
  test('flags a slow "cat" response that overwrites "cats"', async () => {
    const result = await runScenario(naiveAwait, catThenCats({}));
    assert.deepEqual(
      result.violations.map((v) => [v.check, v.afterEvent]),
      [
        ['fresh-render', 3],
        ['consistent-state', 3],
      ],
    );
    assert.deepEqual(result.violations[0]!.state.results, ['cat:1', 'cat:2']);
  });

  test('accepts abort-previous only when the fetcher honours AbortSignal', async () => {
    assert.equal((await runScenario(abortPrevious, catThenCats({ abortMode: 'honors-abort' }))).violations.length, 0);
    assert.notEqual((await runScenario(abortPrevious, catThenCats({ abortMode: 'ignores-abort' }))).violations.length, 0);
  });

  test('flags a stale failure even when stale successes are dropped', async () => {
    assert.equal((await runScenario(guardSuccessOnly, catThenCats({}))).violations.length, 0);
    const result = await runScenario(guardSuccessOnly, catThenCats({ outcomes: ['fail', 'ok'] }));
    assert.match(result.violations[0]!.message, /rendered error for "cat" while the latest query was "cats"/);
  });
});

describe('full evaluation', () => {
  test('latest-wins passes every schedule', async () => {
    const report = await evaluateCandidate(latestWins, space);
    assert.equal(report.verdict, 'pass');
    assert.equal(report.failedChecks, 0);
    assert.equal(report.counterexample, null);
  });

  test('rejects each flawed candidate with a two-query counterexample', async () => {
    for (const candidate of [naiveAwait, abortPrevious, guardSuccessOnly]) {
      const report = await evaluateCandidate(candidate, space);
      assert.equal(report.verdict, 'fail', candidate.id);
      assert.match(report.counterexample!.scenarioId, /^n2\//, candidate.id);
    }
  });

  test('abort-previous fails only against fetchers that ignore AbortSignal', async () => {
    const report = await evaluateCandidate(abortPrevious, space);
    assert.equal(report.failingSchedulesByAbortMode['honors-abort'], 0);
    assert.ok(report.failingSchedulesByAbortMode['ignores-abort'] > 0);
  });

  test('reports schedules where the UI is left on stale data after every response arrives', async () => {
    const report = await evaluateCandidate(naiveAwait, space);
    assert.ok(report.schedulesEndingStale > 0);
    assert.match(report.endsStaleCounterexample!.timeline, /^type "c" -> type "ca" -> "ca" responds -> "c" responds$/);
  });
});
