# Dashboard database round trips

(codex), 24 November 2026.

Set `MAAL_QUERY_METRICS=1` on a development server. The summary at the end of
each API response shows statement count, peak simultaneous statements, summed
query time, and request time. It records the static Express route pattern
without SQL, parameters, the request URL, or user identifiers. The switch is
disabled in production.

Fixture counts below exclude session queries and distinguish serial dependency
depth from peak overlap. They are measurements of database calls in the request
handlers on populated fixtures, with no network latency estimate.

| Request or operation | Statements before → after | Serial depth before → after |
| --- | ---: | ---: |
| Wealth summary, including canonical parity reads | 11 → 5 | 1 → 1 |
| Home score, profile and asset input reads | 12 → 6 | 1 → 1 |
| Recurring transactions, populated | 3 → 3 | 3 → 2 |
| Net-worth snapshots query | 1 → 1 | 1 → 1 |
| Per-account net-worth history query | 1 → 1 | 1 → 1 |

Score history follows the best-effort write so the read can include today's
value. Its lineage operations also depend on the calculated score. Both paths
are unchanged. Net-worth snapshot history and account-filtered history are reads.
Their writes already run through the daily capture job. That job keeps immutable
first observations and batches the account inserts into one statement.

The remaining Home and Spending requests can be timed from the same development
logs. These counts are scoped to the affected endpoints and snapshot paths.
