# BLOB, date and prompt compatibility (unreleased alpha)

These changes adapt PR #43 for the development `alpha` branch. They are not yet an npm release; stable 2.12.0 and the published alpha tag are unchanged.

## Pure-JavaScript database transactions

Queries using `node-firebird` run **once** inside an explicit transaction. BLOB columns, including `LIST()` results and columns whose first row is NULL, are read using that same transaction before commit. SQL is never replayed after inspecting its results.

The transaction keeps the driver's existing repeatable-read, read/write isolation. Existing SQL authorization, `ALLOW_RAW_SQL` and internal audit writes remain in effect. The proposed `FIREBIRD_READ_ONLY` setting is not introduced. The native adapter retains its existing transaction and BLOB handling.

Commit failures reject the query. Rollback/commit callbacks and returned adapter promises must finish before the attachment can be released or discarded; a fixed timer never declares transaction cleanup successful. Existing configured query deadlines still reject the request promptly, but pending database work continues to occupy its pool slot until it settles. No implicit deadline is added. A callback that never arrives can therefore retain a slot indefinitely; a configured deadline is not server-side cancellation. Do not automatically retry timed-out writes, which may still commit.

## Date representation

Only pure-JS database row columns containing JavaScript `Date` values are formatted as `YYYY-MM-DD HH:mm:ss.SSS`, retaining the driver's local wall-clock fields without appending a misleading UTC `Z`. This affects query results and resources using the shared database path. Dates have a midnight time component; precision is limited to the milliseconds exposed by JavaScript, not Firebird's full fractional precision.

Consumers that previously interpreted these values as UTC instants should adjust their parsing and apply an explicit application timezone where needed. This is not support for Firebird timezone-aware types or a correction of every driver-specific date limitation. The native driver's representation, generic tool dates and binary Buffer serialization are unchanged. Existing text-BLOB decoding is preserved; no blanket binary-to-UTF-8 conversion has been added.

## Statistics and prompts

`analyze-table-statistics` uses `TOTAL_ROWS` for its SQL count alias; the response field remains `rowCount`.

The health-check and security-audit prompts accept either one string or an array of recognized values. Invalid members are dropped; empty/unrecognized input (including `$1`) uses the documented default. Missing query-optimization and migration-planning arguments now default to `general` and `schema-change` respectively. This normalization only generates prompt text; it does not grant SQL permissions or execute a migration.

## Validation scope

Regression tests exercise real query-policy/transaction orchestration with controlled driver callbacks, commit/rollback failures and delays, BLOB deadlines, write/audit compatibility, prompt retrieval over MCP, nonzero statistics and wire-decoded dates in UTC, Istanbul, Bogota and New York. These automated tests do not claim live native-driver or WIN1254 database coverage. The opt-in `scripts/security-firebird-smoke.mjs` additionally exercises real BLOB/NULL/LIST results, dates and statistics when a disposable local Firebird service is available.
