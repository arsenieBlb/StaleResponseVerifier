# stale-response-verifier

**Checks AI-generated TypeScript search code for stale-response race conditions by testing every legal response order.**

When you type `cat` and then `cats`, the `cat` request can return last and replace the `cats` results. Hand-written tests rarely catch this because they settle requests in a convenient order. This harness models the network deterministically and tests every legal interleaving of keystrokes and responses.

## Result

Four candidate implementations of the same search controller, matching patterns common in AI-generated code, pass the same **5 hand-written example tests**. The schedule explorer rejects three of them:

| Candidate | Hand-written tests | Failing schedules | Leaves UI on stale data |
| --- | --- | --- | --- |
| `naive-await`: renders every response | 5 / 5 pass | 3,568 / 3,624 | 1,944 schedules |
| `abort-previous`: aborts and trusts the fetcher | 5 / 5 pass | 1,784 / 3,624 | 972 schedules |
| `guard-success-only`: drops stale success, not stale failure | 5 / 5 pass | 2,744 / 3,624 | 1,196 schedules |
| `latest-wins`: request token plus abort | 5 / 5 pass | **0 / 3,624** | **0** |

**3,624 schedules per candidate, 14,496 runs, and 210,976 invariant checks complete in under 1 second.** Each failure is reduced to the shortest timeline that reproduces it. Here is one example:

```text
guard-success-only (honors-abort)
type "c" -> type "ca" -> "ca" responds -> "c" fails
consistent-state: expected results for "ca", but the UI shows error for "c"
```

The `abort-previous` result shows why the explorer models transport behavior: the implementation is correct **only** when the fetcher rejects on `AbortSignal`. It passes every schedule with a fetcher that honors `AbortSignal` and fails in 1,784 schedules when the fetcher ignores the signal, as some caches, wrappers, and SDKs do.

## How it works

- **Scenario space** includes 2–4 queries (`c`, `ca`, `cat`, `cats`), every success and failure combination, every legal arrival order, and fetchers that do and do not honor `AbortSignal`. The number of arrival orders for *n* queries is (2n)! / 2ⁿ: 3, 15, and 105.
- **Deterministic network:** the harness controls each promise and decides exactly when it settles. Tests do not use timers, randomness, or `sleep`.
- **Invariants** are checked after every render and every event:
  - `fresh-render`: each render must belong to the latest query.
  - `consistent-state`: the UI shows loading while the latest request is pending, then shows that request's result or error.
- **Reports:** `reports/evaluation.json` contains machine-readable output, and `reports/summary.md` contains a readable summary with the shortest counterexamples.

```text
src/
  harness.ts          schedule enumeration, deterministic fetcher, invariant checks
  evaluate.ts         per-candidate aggregation and counterexample selection
  cli.ts              writes reports/
  candidates/         four implementations under evaluation
test/
  examples.test.ts    hand-written tests that all four candidates pass
  harness.test.ts     enumeration counts, known races, full-space verdicts
```

## Run it

Requires Node.js 23.6 or later. TypeScript runs directly through Node's built-in type stripping.

```sh
npm install        # only needed for `npm run typecheck`
npm test           # 30 tests
npm run typecheck  # tsc --noEmit, strict mode
npm run evaluate   # regenerates reports/
```

## Evaluate your own implementation

Implement the `Candidate` interface in `src/types.ts`, add the candidate to `src/candidates/index.ts`, and run `npm run evaluate`.
