import type { Candidate, SearchFetcher, SearchState } from './types.ts';

export type Outcome = 'ok' | 'fail';
export type AbortMode = 'honors-abort' | 'ignores-abort';
export type CheckName = 'fresh-render' | 'consistent-state';

export type ScheduleEvent =
  | { readonly kind: 'issue'; readonly request: number }
  | { readonly kind: 'settle'; readonly request: number };

export interface Scenario {
  readonly id: string;
  readonly queries: readonly string[];
  readonly outcomes: readonly Outcome[];
  readonly abortMode: AbortMode;
  readonly events: readonly ScheduleEvent[];
}

export interface Violation {
  readonly check: CheckName;
  readonly afterEvent: number;
  readonly message: string;
  readonly state: SearchState;
}

export interface ScenarioResult {
  readonly scenario: Scenario;
  readonly checks: number;
  readonly violations: readonly Violation[];
}

export const QUERIES: readonly string[] = ['c', 'ca', 'cat', 'cats'];
export const ABORT_MODES: readonly AbortMode[] = ['honors-abort', 'ignores-abort'];

export function resultsFor(query: string): string[] {
  return [`${query}:1`, `${query}:2`];
}

export function failureFor(query: string): string {
  return `search failed for "${query}"`;
}

/** Every ordering where queries are typed in order and each response arrives after its request. */
export function* interleavings(n: number): Generator<ScheduleEvent[]> {
  function* walk(issued: number, settled: ReadonlySet<number>, prefix: ScheduleEvent[]): Generator<ScheduleEvent[]> {
    if (issued === n && settled.size === n) {
      yield prefix;
      return;
    }
    if (issued < n) {
      yield* walk(issued + 1, settled, [...prefix, { kind: 'issue', request: issued }]);
    }
    for (let i = 0; i < issued; i++) {
      if (!settled.has(i)) {
        yield* walk(issued, new Set([...settled, i]), [...prefix, { kind: 'settle', request: i }]);
      }
    }
  }
  yield* walk(0, new Set(), []);
}

export function* outcomeCombos(n: number): Generator<Outcome[]> {
  for (let mask = 0; mask < 1 << n; mask++) {
    yield Array.from({ length: n }, (_, i): Outcome => ((mask >> i) & 1 ? 'fail' : 'ok'));
  }
}

function encodeEvents(events: readonly ScheduleEvent[]): string {
  return events.map((e) => `${e.kind === 'issue' ? 'I' : 'S'}${e.request}`).join('.');
}

/** Ordered by query count, so the first failing scenario found is also one of the shortest. */
export function* scenarios(minQueries = 2, maxQueries = QUERIES.length): Generator<Scenario> {
  for (let n = minQueries; n <= maxQueries; n++) {
    const queries = QUERIES.slice(0, n);
    for (const abortMode of ABORT_MODES) {
      for (const outcomes of outcomeCombos(n)) {
        for (const events of interleavings(n)) {
          const id = `n${n}/${abortMode}/${outcomes.join(',')}/${encodeEvents(events)}`;
          yield { id, queries, outcomes, abortMode, events };
        }
      }
    }
  }
}

export function describeTimeline(scenario: Scenario): string {
  return scenario.events
    .map((e) => {
      const query = scenario.queries[e.request];
      if (e.kind === 'issue') return `type "${query}"`;
      return scenario.outcomes[e.request] === 'ok' ? `"${query}" responds` : `"${query}" fails`;
    })
    .join(' -> ');
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

interface Slot {
  resolve: (results: string[]) => void;
  reject: (err: unknown) => void;
  settled: boolean;
}

function snapshot(state: SearchState): SearchState {
  return { ...state, results: [...state.results] };
}

/**
 * Drives one candidate through one scenario with a fully controlled fetcher.
 * After every render and every event it checks that the UI only reflects the latest query.
 */
export async function runScenario(candidate: Candidate, scenario: Scenario): Promise<ScenarioResult> {
  const { queries, outcomes, abortMode, events } = scenario;
  const slots = new Map<string, Slot>();
  const resultOrigin = new Map<string, number>();
  queries.forEach((q, i) => resultsFor(q).forEach((r) => resultOrigin.set(r, i)));

  let latest = -1;
  let eventIndex = -1;
  let checks = 0;
  const violations: Violation[] = [];

  const fetcher: SearchFetcher = (query, signal) =>
    new Promise<string[]>((resolve, reject) => {
      const slot: Slot = { resolve, reject, settled: false };
      slots.set(query, slot);
      if (abortMode === 'honors-abort') {
        const onAbort = () => {
          if (slot.settled) return;
          slot.settled = true;
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    });

  const originOf = (state: SearchState): number => {
    if (state.status === 'success') return resultOrigin.get(state.results[0] ?? '') ?? -1;
    if (state.status === 'error') return queries.findIndex((q) => failureFor(q) === state.error);
    return queries.indexOf(state.query);
  };

  const controller = candidate.create(fetcher, (state) => {
    checks++;
    const origin = originOf(state);
    if (origin !== latest) {
      violations.push({
        check: 'fresh-render',
        afterEvent: eventIndex,
        message: `rendered ${state.status} for "${queries[origin] ?? '?'}" while the latest query was "${queries[latest]}"`,
        state: snapshot(state),
      });
    }
  });

  const checkState = () => {
    checks++;
    const query = queries[latest]!;
    const slot = slots.get(query);
    const state = controller.getState();
    let expected: string;
    let ok: boolean;
    if (!slot?.settled) {
      expected = `loading for "${query}"`;
      ok = state.status === 'loading' && state.query === query;
    } else if (outcomes[latest] === 'ok') {
      const want = resultsFor(query);
      expected = `results for "${query}"`;
      ok =
        state.status === 'success' &&
        state.query === query &&
        state.results.length === want.length &&
        want.every((r, i) => state.results[i] === r);
    } else {
      expected = `error for "${query}"`;
      ok = state.status === 'error' && state.query === query && state.error === failureFor(query);
    }
    if (!ok) {
      const origin = originOf(state);
      violations.push({
        check: 'consistent-state',
        afterEvent: eventIndex,
        message: `expected ${expected}, but the UI shows ${state.status} for "${queries[origin] ?? state.query}"`,
        state: snapshot(state),
      });
    }
  };

  for (const [i, event] of events.entries()) {
    eventIndex = i;
    const query = queries[event.request]!;
    if (event.kind === 'issue') {
      latest = event.request;
      controller.search(query);
    } else {
      const slot = slots.get(query);
      if (slot && !slot.settled) {
        slot.settled = true;
        if (outcomes[event.request] === 'ok') slot.resolve(resultsFor(query));
        else slot.reject(new Error(failureFor(query)));
      }
    }
    await flush();
    checkState();
  }

  return { scenario, checks, violations };
}
