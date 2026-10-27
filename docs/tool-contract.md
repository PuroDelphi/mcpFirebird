# MCP tool result contract

Every database, metadata and echo tool declares an `outputSchema`, returns
`structuredContent`, and preserves its pre-existing text response shape for clients
that only display `content`. Starting in 2.13.0-alpha.2, markup delimiters in text
are encoded as described below.

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
content encodes markup delimiters starting in 2.13.0-alpha.2.

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
legacy error text shape is preserved, with display encoding. A failed batch has `success: false` and
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

## Display text encoding (#47, 2.13.0-alpha.2)

Tool `content[].text` is display text, not trusted HTML or a template. Starting in
2.13.0-alpha.2, the shared result/error helpers encode `<`, `>`, `&`, braces,
brackets, backticks and Markdown emphasis/link delimiters inside JSON string
values and keys as `\uXXXX` escapes. JSON syntax, indentation and existing escapes
remain intact: `JSON.parse` recovers the original values, including table names,
SQL, database text, error details, Unicode, Dates and Buffers after normal JSON
serialization. `structuredContent` retains these original values as well.

Plain-text echo responses, metadata headings and custom errors use numeric HTML
character references instead. For example, echoing `<b>{{name}}</b>` produces
`&#60;b&#62;&#123;&#123;name&#125;&#125;&#60;/b&#62;` in `content`, while
`structuredContent.result.message` remains `<b>{{name}}</b>`. Plain-text-only
clients may show the references literally; consumers needing the exact echo
message should use the structured field. Ordinary headings and messages without
these delimiters are unchanged. Echo logs the invocation without its message.

This addresses the four reported tools on success and failure, plus other tools
using the shared helpers. It does not introduce a restrictive table-name pattern
or change SQL authorization. The configured response-size limit includes the
encoded text, so markup-heavy responses may reach it sooner.

This is display-boundary encoding, not a general HTML sanitizer or a guarantee
against prompt injection. Clients must still treat decoded JSON and structured
values as untrusted data, use text-safe rendering, and avoid inserting them into
HTML attributes, scripts or executable templates. Resource and prompt output
formats are outside this change. See [OWASP's output-encoding guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

### Español: codificación del texto

Desde 2.13.0-alpha.2, el texto JSON codifica los delimitadores de marcas mediante
`\uXXXX`; `JSON.parse` y `structuredContent` conservan los valores originales.
El texto de `echo`, los encabezados y los errores personalizados usan referencias
HTML numéricas, que algunos clientes de texto plano mostrarán literalmente.
Para recuperar el mensaje exacto de `echo`, usa `structuredContent.result.message`.
Se mantienen los nombres de tablas aceptados, las políticas SQL y los esquemas.
El límite de respuesta se aplica después de codificar. Los clientes deben mostrar
los datos estructurados o decodificados como texto no confiable; esta medida no
convierte esos valores en HTML seguro ni evita la inyección de instrucciones.

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

## Metadata and unavailable execution plans (#45, 2.12.1-alpha.2)

These changes, first shipped in `2.12.1-alpha.2`, are included in stable `2.12.1`. See the [release notes](releases/2.12.1.md).

In stable 2.12.2 and the earlier alpha, `get-execution-plan` cannot retrieve a plan through the driver
interfaces used there. It returns `success: false`, `plan: ""`, `planDetails: []`, and
`error: "Execution plan not available"`, preserving manual-tool guidance in
`analysis`. The MCP response also has `isError: true` and structured
`success: false`; clients must not treat the guidance as a retrieved plan.
This corrects the former successful placeholder response. The request still
passes the existing SQL policy checks and does not execute the supplied query.
No monitoring-table workaround or permission bypass is introduced.

**Starting with 2.13.0-alpha.1**, the tool uses prepare-only statement-info APIs
to return real optimizer plan text with `success: true` when available. The
result shape is unchanged and `planDetails` remains `[]`. The SQL is policy-checked
and row-filtered, prepared in a read-only transaction and never executed/fetched;
parameter values are not bound. Unavailable plans and policy/driver/cleanup failures
retain the error contract above. The index advisor also checks catalog indexes,
including primary keys, before suggesting DDL. No DDL is applied. See the
[diagnostics guide](query-diagnostics.md) for supported query shapes and limits.

`describe-table`, `describe-batch-tables`, and `get-field-descriptions` read full
column-description BLOBs instead of casting them to `VARCHAR(500)`. Existing
BLOB decoding, table authorization, query deadlines, masking and response-size
limits still apply. A description longer than 500 characters alone no longer
causes a SQL truncation error. These changes are included starting with
`2.12.1-alpha.2`; installing `2.12.1-alpha.1` does not include them. No new setting
is required: retain existing connection/policy parameters and restart the MCP.

`get-server-info.capabilities.tools` and `totalTools` now reflect the registered
server catalog, including simple/event tools when registered. The health result's
`tools.total` uses the same catalog. Its additive `tools.other` count covers tools
outside the existing database and metadata categories, so the categories add up
to the total. Counts are not hardcoded and account for event-policy registration.

### Español

`get-execution-plan` devuelve `success: false`, `plan: ""`, `planDetails: []` y
`error: "Execution plan not available"` cuando no puede obtener el plan. La
respuesta MCP también indica `isError: true` y conserva las instrucciones
manuales en `analysis`. La consulta sigue pasando por la política SQL y no se
ejecuta. No se añade ningún acceso alternativo a las tablas de monitorización.

Las tres herramientas de descripción leen el BLOB completo, sin convertirlo a
`VARCHAR(500)`. Se mantienen los controles de acceso, los plazos de consulta,
el enmascaramiento y los límites de tamaño configurados. Los cambios se incluyen
desde `2.12.1-alpha.2`; no forman parte de `2.12.1-alpha.1`. No requieren opciones
nuevas: conserva la conexión y la política actuales y reinicia el MCP.

`get-server-info` y el total de herramientas de `system-health-check` reflejan el
catálogo registrado, incluidas herramientas simples y de eventos cuando estén
registradas. El campo adicional `tools.other` completa las categorías existentes
de base de datos y metadatos. Los conteos se calculan, no son constantes.
