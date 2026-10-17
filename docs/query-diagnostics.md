# Query diagnostics (stable 2.12.3)

These enhancements complete the two pending diagnostics from issue #45. First tested in 2.13.0-alpha.1, they are now included in **stable 2.12.3**. No alpha installation is required.

## Install and configure

```sh
npm install -g mcp-firebird@latest
# Or pin this stable release:
npm install -g mcp-firebird@2.12.3
```

For an existing `npx` launcher, change only the package argument to `mcp-firebird@2.12.3`. Keep its transport, database, authentication and security settings, then restart the MCP/client. No new diagnostic flag or policy relaxation is needed. Node.js 20.19+ is required. Historical ISO/UTC dates remain the default; `FIREBIRD_DATE_FORMAT=wall-clock` remains explicitly optional.

## `get-execution-plan`

Example tool arguments:

```json
{"sql":"SELECT * FROM CUSTOMERS WHERE ID = ?","params":[123]}
```

The MCP prepares the **policy-adjusted SELECT** in a read-only transaction, requests the server's legacy optimizer plan, releases the statement and rolls back. It does **not execute/fetch the SELECT**, bind parameter values, run `analyze-query-performance` implicitly or query other sessions' monitoring tables. `params` is retained for API compatibility/auditing; parameter values do not influence this prepare-only plan.

The pure-JS adapter uses node-firebird's prepare plan flag, including its lazy-send wire batching. The native adapter uses the installed attachment's statement-info API if available; no driver is replaced or upgraded. The plan describes the compilation strategy, **not measured runtime**, timings or actual row counts. `planDetails` remains `[]`; the tool does not claim a full plan parser or detailed EXPLAIN support. A natural scan is not by itself evidence that an index is missing.

Only statements beginning with `SELECT` are supported, not `WITH`/CTEs, DML, DDL or execute blocks. Existing conservative SQL policy can reject other constructs. Allowed/forbidden tables, operations and roles, system-table/routine restrictions, row-filter rewriting and masking projection rules remain enforced. Existing query deadlines, quotas, audit requirements and response limits apply. If a deadline expires, the client gets an error; the attachment remains reserved until pending driver work and cleanup settle, then is discarded. This is not server-side cancellation.

On success, the existing result shape contains `success: true` and real plan text. Unsupported APIs, empty plans, database/policy/cleanup failures or oversized plans produce `success: false`, empty `plan`/`planDetails` and MCP `isError: true`. Asynchronous node-firebird descriptor-parser exceptions are contained at the owned attachment's callback boundary, not with a process-wide exception handler. There is **no execution fallback**. Legacy plan metadata at or above 60,000 UTF-8 bytes is rejected conservatively to avoid presenting a near-buffer-limit prefix as complete. An authorized `isql` client with `SET PLANONLY ON` is a manual alternative; do not remove policies just to obtain a plan.

## `analyze-missing-indexes`

```json
{"sql":"SELECT * FROM CUSTOMERS C WHERE C.NAME = ? ORDER BY C.NAME"}
```

The advisor validates the submitted SQL through the existing policy, then uses fixed, parameterized catalog queries for the authorized table. It does not execute the submitted query or create/activate indexes.

- System-generated primary-key/unique indexes are included, not filtered out.
- An active ordinary index covers its matching **leading columns**. A non-leading segment does not count as coverage. Predicate checks accept either index direction; ordering checks require the matching direction.
- Inactive equivalents produce a review/reactivation suggestion, **not duplicate CREATE INDEX DDL**. No activation is performed.
- Partial and expression indexes are not assumed to cover general predicates. The partial-index catalog column is feature-detected, preserving compatibility with older Firebird catalogs.
- Matching candidates are deduplicated. Actual catalog columns are required; views, computed columns, arrays and BLOB fields are excluded. Identifiers are quoted/escaped and generated names stay below the 31-character Firebird 2.5 limit.

This is deliberately a **single-table heuristic**, supporting direct column comparisons/IN/BETWEEN/IS predicates and direct, uniformly ascending or descending ORDER BY columns. It does not fully optimize joins, CTEs, subqueries, grouped/window queries, arbitrary expressions or mixed-direction sorts. Unsupported shapes return no DDL with a clear limitation; this is **not proof that no index is needed**. Catalog failures return an error and no unverified suggestions. Candidate discovery examines the submitted query, not extra predicates from administrator row filters; those filters are still enforced by SQL authorization and plan preparation.

Suggestions are not performance guarantees. Before manually applying DDL, review existing metadata again, the actual plan, selectivity, duplicate/redundant indexes, collation/key-size limits, write overhead and an appropriate maintenance window. A different sort direction can justify a different index; a partial/expression index is not an ordinary duplicate. Concurrent schema changes can invalidate advice. Inconsistent segment metadata (for example after catalog-field masking/transformation) is rejected instead of treated as missing coverage. No production DDL is applied automatically.

## Validation scope

Automated checks cover pure-JS/native prepare/info orchestration, cleanup failures, delayed callbacks/promises, lazy-send acknowledgments, deadline ownership, policy denials, row-filter rewriting, quotas/auditing, catalog coverage and MCP output validation over STDIO/HTTP with SDK 1 and SDK 2. The opt-in live smoke creates/drops a UUID-named disposable database on local **Firebird 2.5.9 with the pure-JS driver**. It retrieves real plans, checks an incrementing sequence remains unchanged, and exercises primary-key/composite/descending/inactive indexes plus existing BLOB/date/SQL/audit/event regressions.

Live native-driver and Firebird 5 validation are **not claimed** for this release: the native addon is unavailable on this test machine, and the live server is 2.5.9. Test against your deployed driver/version before a broad production rollout. No dependency or optional-driver version has changed; GitHub Actions remains disabled.

## Español

Instala `mcp-firebird@latest` o fija `mcp-firebird@2.12.3` en tu lanzador y reinicia el MCP, conservando conexión, transporte, autenticación y políticas. Incluye todas las mejoras de 2.13.0-alpha.1; no necesitas instalar la alpha. No se necesitan parámetros nuevos ni relajar permisos; las fechas mantienen ISO/UTC por defecto.

`get-execution-plan` prepara el SELECT autorizado y ajustado por la política dentro de una transacción de solo lectura, obtiene el plan, libera la sentencia y hace rollback. No ejecuta ni recorre la consulta, no vincula los valores de `params` ni consulta sesiones ajenas. No es una medición de rendimiento. Se admiten sentencias que empiezan por SELECT, no CTE/WITH ni escrituras. Si no puede obtener el plan o falla un control/limpieza, devuelve error, nunca lo sustituye por ejecución. Los plazos siguen siendo del cliente: una conexión con trabajo pendiente no se reutiliza hasta que termine y se descarte.

`analyze-missing-indexes` consulta el catálogo, incluyendo índices de claves primarias, únicos y compuestos. No sugiere duplicados cuando un índice ordinario activo cubre las columnas iniciales; si existe uno inactivo propone revisarlo sin activarlo. Distingue dirección para ordenaciones y no supone que los índices parciales/de expresiones cubran cualquier condición. Es una heurística conservadora para SELECT simples de una tabla, no un optimizador general. No encontrar sugerencias no demuestra que no hagan falta índices. No ejecuta el SQL suministrado ni aplica DDL. Revisa manualmente el plan, selectividad, tamaño de clave, metadatos actualizados y costes antes de crear un índice.

Se han añadido pruebas automatizadas de ambos adaptadores y transportes. Las pruebas reales usan una base desechable en Firebird 2.5.9 y driver JavaScript; no se afirma validación real con Firebird 5 ni con el addon nativo. La promoción a estable no cambia el código probado en alpha ni los valores predeterminados de compatibilidad.
