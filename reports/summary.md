# Evaluation summary

Explored **3,624 schedules per candidate** (2-3-4 queries, every success/failure combination, every legal arrival order, and fetchers that do and do not honour `AbortSignal`).
In total, the harness evaluated **210,976 invariant checks** across **14,496 candidate runs**.

| Candidate | Verdict | Failing schedules | Ends on stale data | Failed checks | Honours abort | Ignores abort |
| --- | --- | --- | --- | --- | --- | --- |
| `naive-await` | FAIL | 3568 / 3624 (98.5%) | 1944 | 16352 / 56832 | 1784 failing | 1784 failing |
| `abort-previous` | FAIL | 1784 / 3624 (49.2%) | 972 | 8176 / 52744 | 0 failing | 1784 failing |
| `guard-success-only` | FAIL | 2744 / 3624 (75.7%) | 1196 | 8784 / 52744 | 1372 failing | 1372 failing |
| `latest-wins` | PASS | 0 / 3624 (0.0%) | 0 | 0 / 48656 | 0 failing | 0 failing |

## Shortest counterexamples

- `naive-await` (honors-abort): type "c" -> type "ca" -> "c" responds -> "ca" responds
  - fresh-render: rendered success for "c" while the latest query was "ca"
- `abort-previous` (ignores-abort): type "c" -> type "ca" -> "c" responds -> "ca" responds
  - fresh-render: rendered success for "c" while the latest query was "ca"
- `guard-success-only` (honors-abort): type "c" -> type "ca" -> "c" fails -> "ca" responds
  - fresh-render: rendered error for "c" while the latest query was "ca"
- `latest-wins`: none in the explored space.

## Shortest schedules that leave the UI on stale data

- `naive-await` (honors-abort): type "c" -> type "ca" -> "ca" responds -> "c" responds
  - consistent-state: expected results for "ca", but the UI shows success for "c"
- `abort-previous` (ignores-abort): type "c" -> type "ca" -> "ca" responds -> "c" responds
  - consistent-state: expected results for "ca", but the UI shows success for "c"
- `guard-success-only` (honors-abort): type "c" -> type "ca" -> "ca" responds -> "c" fails
  - consistent-state: expected results for "ca", but the UI shows error for "c"
- `latest-wins`: none in the explored space.
