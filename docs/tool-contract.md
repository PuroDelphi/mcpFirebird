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
values use open JSON values rather than promising an inaccurate string type.
Dates and Buffers receive the same JSON serialization as in the text response.
Non-JSON values such as unsupported BigInts produce a tool error instead of a
misleading successful response.

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
then `npm run build && node --test tests/tool-contracts.test.mjs` for ESM metadata
coverage. Protocol integration should assert that `tools/list` advertises output
schemas/annotations and `tools/call` carries both compatible text and the
structured result across stdio and HTTP protocol versions.
