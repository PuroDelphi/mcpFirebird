# MCP tool result contract

Every database, metadata and echo tool declares an `outputSchema`, returns
`structuredContent`, and preserves its pre-existing text response for clients
that only display `content`.

## Structured results

The structured result is always an object:

```json
{
  "success": true,
  "result": { "rows": [] }
}
```

`result` is the same JSON payload previously returned as text. For metadata
responses, the human-readable heading remains in `content`, while `result`
contains the JSON below it. Existing array payloads remain arrays inside
`result`. Echo returns `{ "message": "..." }` inside `result`, while its text
content remains the original message.

Each tool's schema describes its own payload, including row arrays, table
metadata, performance measurements, runtime information, and batch items. SQL
row keys and values remain database-dependent. Driver-provided BLOB/default
values use explicit recursive JSON types rather than promising an inaccurate string type.
Dates and Buffers receive the same JSON serialization as in the text response.
Non-JSON values such as unsupported BigInts produce a tool error instead of a
misleading successful response.

### Alpha.4 schema compatibility correction (#39)

Starting in **2.12.0-alpha.4**, the `list-tables` and `get-database-info` output
schemas correctly describe `tables` as an array of **strings**, matching the
existing helper and legacy JSON text. Earlier 2.12 alphas incorrectly required
`{name, uri}` objects (the separate database-resource representation) and rejected
nonempty results. No client payload migration or configuration change is needed:

```json
{"success":true,"result":{"tables":["CUSTOMERS","ORDERS"]}}
```

`get-database-info` additionally includes `totalTables` inside `result`.
Resource name/URI objects are unchanged. `analyze-table-statistics` now reads
the normalized column metadata, so column names, types, nullability and default
presence are reported correctly instead of being missing or incorrect.

Dynamic row values, metadata values, plan details and error context use explicit
JSON types (string, number, boolean, null, array, object), with local recursive
schema references. This removes the empty `{}` value schemas behind the reported
Inspector warning without dropping nested data or disabling output validation.
JSON Schema-capable clients must support those standard types and local references.
The response envelope, SQL permissions, timeouts and driver selection are unchanged.

## Errors and partial batches

All execution errors set the MCP `isError` flag to `true`. Caught exceptions,
policy denials, explicit `success: false` results from analysis helpers, and
response-size/output-validation failures follow the same rule:

```json
{
  "success": false,
  "error": { "message": "Database unavailable", "type": "CONNECTION_ERROR" }
}
```

Serializable exception context is included as optional `error.details`. The
legacy error text is preserved. A failed batch has `success: false` and
`isError: true`, but retains the complete per-item results, including successful
items and individual error codes. Analysis failures likewise retain their
original diagnostic payload in `result`.

An empty row/list result is successful. The tool layer never treats arbitrary
SQL columns named `success` or `error` as execution status. Batch query failure
uses the batch item's explicit `success: false`; batch schema failure uses the
helper's explicit `schema: null` variant.

The complete response, including both text and structured data, is subject to
configured response-size limits. An oversized payload is discarded and replaced
with an error result. Error reporting is allowed even if an unusually small cap
cannot accommodate the error message itself.

## Annotations

`execute-query`, `execute-batch-queries`, and `analyze-query-performance` are
write-capable, potentially destructive, non-idempotent tools. They do not claim
read-only behavior even when the default authorization policy rejects writes.
Performance analysis executes the provided query repeatedly.

Metadata readers and other fixed read-only operations advertise read-only,
non-destructive, idempotent behavior over the configured database/process. Plan
retrieval and index suggestions currently inspect SQL without executing it.
The system health tool reports process information, not a database connectivity
probe. Wire encryption reports configuration, not negotiated connection state.

Annotations are client hints, not authorization. This contract does not change
the opt-in SQL authorization policy or grant permission to execute writes.

## Regression checks

Run `npm test -- --runInBand src/__tests__/tools` for handler-level contracts,
then `npm run build` and `npm run test:protocol` for ESM and protocol coverage.
`tests/output-contracts-regression.test.mjs` exercises all 30 database, metadata
and echo handlers with nonempty fixtures at the driver boundary, keeping production
SQL/metadata transformations and policies in the path. It also calls them through
SDK 1 and SDK 2 legacy/2026 clients over STDIO and HTTP, with client output validation
enabled after catalog discovery. Catalog checks include the event-tool schemas;
event behavior has its separate regression suite. These are controlled-driver
tests, not a substitute for live Firebird integration tests.
