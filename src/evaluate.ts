import { describeTimeline, runScenario, scenarios } from './harness.ts';
import type { AbortMode, CheckName, Scenario, Violation } from './harness.ts';
import type { Candidate } from './types.ts';

export interface Counterexample {
  readonly scenarioId: string;
  readonly abortMode: AbortMode;
  readonly timeline: string;
  readonly violation: Violation;
}

export interface CandidateReport {
  readonly id: string;
  readonly description: string;
  readonly verdict: 'pass' | 'fail';
  readonly schedules: number;
  readonly failingSchedules: number;
  readonly checks: number;
  readonly failedChecks: number;
  readonly failedChecksByType: Record<CheckName, number>;
  readonly failingSchedulesByAbortMode: Record<AbortMode, number>;
  /** Schedules where the UI is still wrong after every response has arrived. */
  readonly schedulesEndingStale: number;
  readonly counterexample: Counterexample | null;
  readonly endsStaleCounterexample: Counterexample | null;
}

export interface EvaluationReport {
  readonly scenarioSpace: {
    readonly queryCounts: readonly number[];
    readonly abortModes: readonly AbortMode[];
    readonly schedulesPerCandidate: number;
  };
  readonly totals: { readonly schedules: number; readonly checks: number };
  readonly candidates: readonly CandidateReport[];
}

export async function evaluateCandidate(candidate: Candidate, space: readonly Scenario[]): Promise<CandidateReport> {
  let checks = 0;
  let failedChecks = 0;
  let failingSchedules = 0;
  const failedChecksByType: Record<CheckName, number> = { 'fresh-render': 0, 'consistent-state': 0 };
  const failingSchedulesByAbortMode: Record<AbortMode, number> = { 'honors-abort': 0, 'ignores-abort': 0 };
  let schedulesEndingStale = 0;
  let counterexample: Counterexample | null = null;
  let endsStaleCounterexample: Counterexample | null = null;
  const toCounterexample = (scenario: Scenario, violation: Violation): Counterexample => ({
    scenarioId: scenario.id,
    abortMode: scenario.abortMode,
    timeline: describeTimeline(scenario),
    violation,
  });

  for (const scenario of space) {
    const result = await runScenario(candidate, scenario);
    checks += result.checks;
    if (result.violations.length === 0) continue;

    failingSchedules++;
    failedChecks += result.violations.length;
    failingSchedulesByAbortMode[scenario.abortMode]++;
    for (const v of result.violations) failedChecksByType[v.check]++;
    // Scenarios are ordered by query count, so the first failure is a shortest one.
    counterexample ??= toCounterexample(scenario, result.violations[0]!);
    const lastEvent = scenario.events.length - 1;
    const finalViolation = result.violations.find((v) => v.check === 'consistent-state' && v.afterEvent === lastEvent);
    if (finalViolation) {
      schedulesEndingStale++;
      endsStaleCounterexample ??= toCounterexample(scenario, finalViolation);
    }
  }

  return {
    id: candidate.id,
    description: candidate.description,
    verdict: failingSchedules === 0 ? 'pass' : 'fail',
    schedules: space.length,
    failingSchedules,
    checks,
    failedChecks,
    failedChecksByType,
    failingSchedulesByAbortMode,
    schedulesEndingStale,
    counterexample,
    endsStaleCounterexample,
  };
}

export async function evaluate(
  candidates: readonly Candidate[],
  minQueries = 2,
  maxQueries = 4,
): Promise<EvaluationReport> {
  const space = [...scenarios(minQueries, maxQueries)];
  const reports: CandidateReport[] = [];
  for (const candidate of candidates) reports.push(await evaluateCandidate(candidate, space));

  return {
    scenarioSpace: {
      queryCounts: Array.from({ length: maxQueries - minQueries + 1 }, (_, i) => minQueries + i),
      abortModes: ['honors-abort', 'ignores-abort'],
      schedulesPerCandidate: space.length,
    },
    totals: {
      schedules: reports.reduce((sum, r) => sum + r.schedules, 0),
      checks: reports.reduce((sum, r) => sum + r.checks, 0),
    },
    candidates: reports,
  };
}

const pct = (part: number, whole: number) => `${((100 * part) / whole).toFixed(1)}%`;

export function toMarkdown(report: EvaluationReport): string {
  const lines = [
    '# Evaluation summary',
    '',
    `Explored **${report.scenarioSpace.schedulesPerCandidate.toLocaleString('en-US')} schedules per candidate** ` +
      `(${report.scenarioSpace.queryCounts.join('-')} queries, every success/failure combination, every legal ` +
      `arrival order, and fetchers that do and do not honour \`AbortSignal\`).`,
    `In total, the harness evaluated **${report.totals.checks.toLocaleString('en-US')} invariant checks** across ` +
      `**${report.totals.schedules.toLocaleString('en-US')} candidate runs**.`,
    '',
    '| Candidate | Verdict | Failing schedules | Ends on stale data | Failed checks | Honours abort | Ignores abort |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const c of report.candidates) {
    lines.push(
      `| \`${c.id}\` | ${c.verdict === 'pass' ? 'PASS' : 'FAIL'} | ${c.failingSchedules} / ${c.schedules} ` +
        `(${pct(c.failingSchedules, c.schedules)}) | ${c.schedulesEndingStale} | ${c.failedChecks} / ${c.checks} | ` +
        `${c.failingSchedulesByAbortMode['honors-abort']} failing | ${c.failingSchedulesByAbortMode['ignores-abort']} failing |`,
    );
  }
  const section = (title: string, pick: (c: CandidateReport) => Counterexample | null) => {
    lines.push('', `## ${title}`, '');
    for (const c of report.candidates) {
      const example = pick(c);
      if (!example) {
        lines.push(`- \`${c.id}\`: none in the explored space.`);
        continue;
      }
      const { timeline, abortMode, violation } = example;
      lines.push(`- \`${c.id}\` (${abortMode}): ${timeline}`, `  - ${violation.check}: ${violation.message}`);
    }
  };
  section('Shortest counterexamples', (c) => c.counterexample);
  section('Shortest schedules that leave the UI on stale data', (c) => c.endsStaleCounterexample);
  lines.push('');
  return lines.join('\n');
}
