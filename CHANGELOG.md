# Changelog

## [2.12.0-alpha.5] - 2026-10-02

### Fixed
- Address #41 through PR #42: distinguish derived `FROM (SELECT ...)`, `JOIN (SELECT ...)` and named-column `JOIN ... USING (...)` syntax from routine calls. Check nested sources/functions instead of globally allowlisting SQL keywords.
- Keep catalog/routine denials effective for nested queries, comma sources hidden behind quoted aliases, and package-qualified names resembling builtins. Table, row, masking and role policies retain their conservative single-table boundary.
- Include the previously merged PR #40: drain asynchronous pooled-connection probe cleanup before disconnecting; retain busy attachments until cleanup completes, including probe deadlines and late failures.

### Regression prevention
- Add 151 unit cases from PR #42 and a further 230-case syntax/policy matrix covering formatting, comments, quoted identifiers, nesting, the reporter's empty-denylist policy, forbidden constructs and subsequently populated denylists. Retain #36 EXTRACT/SUBSTRING/TRIM coverage and query-boundary checks that preserve SQL/parameters and reject before connection acquisition.
- Add `npm run verify:release` and a local `prepublishOnly` gate: typecheck, fresh build, lint error checks, all unit/protocol tests and compiled security smoke checks. Limit Jest discovery to `src` to exclude temporary review snapshots. GitHub Actions remains disabled.
- Expand the opt-in live Firebird smoke test with derived sources, JOIN ON/USING, parameters, nested catalog denial and the populated-denylist boundary.
- Refresh only the locked transitive Hono dependency from 4.13.5 to 4.13.12, addressing [GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv). Firebird drivers and direct dependency ranges are unchanged.

### Compatibility and validation
- No new setting is required: keep the existing connection/security configuration and restart after upgrading. An empty `forbiddenTables` list does not activate table scoping; a nonempty list does. Complex queries with scoped policies still require a database-enforced view. Do not disable required controls to bypass this limit. See the [English](docs/security.md) / [Spanish](docs/security.es.md) guides.
- Default behavior, opt-in security controls and Node.js 20.19+ requirements are unchanged. This is an alpha release; stable/latest stays at 2.11.0. The parser remains a deliberately limited subset, not a guarantee of support for all Firebird SQL.
- Validation: 735 unit tests, 88 protocol/regression tests (no skips), compiled security smoke checks, build, typecheck and lint error checks passed. Live integration passed on a disposable Firebird 2.5.9 database with the pure-JS driver, including #36/#41 queries, filtering/masking, auditing and real event delivery/reconnect. This does not claim live native-driver or other Firebird-version coverage.
- Production dependency audit: zero known vulnerabilities after the Hono refresh. The full development tree still reports three advisory groups in build/test dependencies; those are not installed as this package's production dependencies and are outside this SQL fix.

## [2.12.0-alpha.4] - 2026-09-30

### Fixed
- Fix #39: `list-tables` and `get-database-info` now advertise arrays of table-name strings, matching their unchanged runtime/legacy text payloads. The initial MCP 2026 alpha output schema confused these with resource name/URI objects and rejected nonempty lists.
- Replace unconstrained empty value schemas with explicit recursive JSON types for rows, metadata, plan details and error context. Preserve nested JSON data and output validation while removing the reported Inspector warning.
- Correct `analyze-table-statistics` to read normalized column metadata, restoring column names, types, nullability and default presence.

### Regression coverage and compatibility
- Add nonempty driver-boundary fixtures for all 30 database, metadata and echo handlers, exercising production mapping instead of mocking helper return values. Check catalog schemas and call every handler through SDK 1 and SDK 2 legacy/2026 clients over STDIO and HTTP.
- Retain the #38 lifecycle and configurable-timeout fixes, legacy text formats, opt-in security defaults and unchanged driver dependencies. Node.js 20.19+ required; stable/latest remains unchanged. GitHub Actions stays disabled.
- See [tool contract](docs/tool-contract.md) for payload examples and validation details. No client configuration migration is required for this fix. Live Firebird integration could not be repeated because the local test service refused connections; controlled-driver tests are not claimed as live coverage.
- Validation: 346 unit tests, 80 protocol/regression tests, compiled security smoke checks and TypeScript build passed. Lint: no errors. Production dependency audit: zero vulnerabilities.

## [2.12.0-alpha.3] - 2026-09-30

### Fixed
- Honor `QUERY_TIMEOUT` as an opt-in environment fallback for `security.queryTimeout` during security initialization, including JSON and CommonJS policies.
- Preserve explicit policy timeout precedence and the independent lower `resourceLimits.maxQueryCpuTime` cap. Reject malformed or overflowing environment deadlines rather than silently using unsafe timer values.
- Test environment configuration, policy precedence and legacy caps through strict-unhandled-rejection subprocesses, retaining the #38 safe attachment lifecycle fix.

### Configuration and compatibility
- Units are milliseconds; `QUERY_TIMEOUT` accepts decimal integers from 1 to 2147483647. Unset/blank means no environment fallback; no implicit timeout is introduced. Restart the MCP process to apply changes.
- Previously ignored nonempty `QUERY_TIMEOUT` values now take effect, including the 30000 ms environment/Compose examples. Explicit `security.queryTimeout` takes priority; remove both policy deadlines and unset/blank the variable to disable the limit completely. Zero is not a disable switch.
- Document environment, inline JSON and file configuration in the [English security guide](docs/security.md#configuring-the-query-timeout) and [Spanish guide](docs/security.es.md#configurar-el-timeout-de-las-consultas). Requires Node.js 20.19+; stable/latest and driver selection remain unchanged.

### Validation
- 342 unit tests, 42 protocol/regression tests, compiled security smoke checks and TypeScript build passed. Lint: no errors. Production dependency audit: zero vulnerabilities. Timeout regressions use controlled driver adapters, not a live Firebird connection.

## [2.12.0-alpha.2] - 2026-09-30

### Fixed
- Fix #38: observe async driver promises as well as callbacks and wait for adapter cleanup before releasing/disconnecting an attachment.
- Return query deadlines without disconnecting in-flight driver/BLOB work. Keep the attachment checked out until completion, then discard it once; never recycle it or process late results.
- Drain concurrent BLOB reads before propagating failures so sibling reads cannot race attachment teardown.
- Add strict-unhandled-rejection subprocess regressions covering late success, rejection and post-callback cleanup failure, plus subsequent successful queries through a one-slot pool.

### Compatibility
- Existing SQL policies, opt-in deadlines, HTTP compatibility defaults and Firebird driver selection are unchanged. Pending timed-out operations retain their pool slots until completion; this is not server-side cancellation, and timed-out writes must not be retried automatically.
- Includes the MCP 2026 alpha changes below and requires Node.js 20.19+. Stable/latest remains unchanged. See [English security guide](docs/security.md) / [Spanish guide](docs/security.es.md).

### Validation
- 319 unit tests, 36 protocol/regression tests, compiled security smoke checks and TypeScript build passed on Node 24.14.1. Lint: no errors. Production dependency audit: zero vulnerabilities.
- Strict Node subprocess regressions use controlled driver adapters, not a live native Firebird connection. Live integration could not be repeated for this patch because local Firebird port 3050 refused connections; the previous alpha's live results are not claimed for this patch.


## [2.12.0-alpha.1] - 2026-09-29

- Opt into MCP 2026-07-28 via SDK v2 factories while retaining 2025 stdio/HTTP and legacy SSE clients
- Share one server implementation across executable entry points
- Preserve historical HTTP binding, wildcard non-cookie CORS and introspection-only OAuth in the default `compat` mode; warn about the security trade-offs
- Add opt-in `MCP_HTTP_SECURITY_MODE=strict`: loopback defaults, Host/Origin validation and explicit remote exposure; explicit allowlists and OAuth audiences are enforced in either mode
- Add protected-resource OAuth discovery, token audience checks, and MCP browser headers
- Add structured tool results, output schemas, honest annotations, and consistent protocol errors
- Isolate event subscribers and release listeners on disconnect
- Retain dependency security fixes from stable 2.11.0; leave GitHub Actions disabled and exclude the proposed CI workflow
- Isolate protocol test subprocesses from developer .env files and configured ports
- Exclude local proof-of-concept files, test runners and manual smoke scripts from the npm runtime package
- Preserve the authenticated root health endpoint; test real pure-JS Firebird events, subscriber isolation, cleanup and reconnect against a disposable Firebird 2.5.9 database
- Require Node.js 20.19+ for SDK v2. Older runtimes should remain on stable 2.11.0 until upgraded; database drivers and SQL opt-in defaults are unchanged

See [migration notes](docs/mcp-2026-migration.md) for opt-in HTTP/OAuth hardening and upgrade requirements.

Validation: 312 unit tests and 33 protocol/event/contract tests passed on Node 24.14.1, plus compiled security smoke checks and real SQL/pure-JS events on Firebird 2.5.9. TypeScript build and lint passed (182 existing warnings, no errors); production dependency audit reported zero vulnerabilities. Native event delivery still requires deployment validation.

All notable changes to this project will be documented in this file.

## [2.11.0] - 2026-09-29

Promote all changes from `2.11.0-alpha.1` through `2.11.0-alpha.4` since stable `2.10.0`. The reporter confirmed the original query in #36 now works correctly.

### Added
- Configure security without a file through validated `FIREBIRD_SECURITY_JSON`, including SQL options at the root or inside `security` (#34). Existing file-source precedence is retained.
- Enforce explicitly configured table/operation permissions, catalog policies, row filters, alias-aware masking, resource limits, auditing and OAuth2/role permissions at query execution and transport boundaries.
- Include English and Spanish configuration guides, compatibility examples and a security implementation review.

### Fixed
- Distinguish FROM inside EXTRACT, SUBSTRING and TRIM arguments from actual table clauses, preserving authorization and row filters (#36).
- Normalize stored-procedure result objects before BLOB resolution and output controls.
- Fix HTTP transport shutdown recursion, isolate request identity and bind authenticated HTTP/SSE sessions to their owner.
- Reject invalid selected security configurations rather than silently weakening policy. Make masking/audit failures withhold results and handle timed-out connections safely.
- Exclude temporary test/cache files and tarballs from npm packages.

### Compatibility and migration
- Advanced controls remain **opt-in**: no new implicit row/size/deadline/rate/query-count limits or catalog/routine restrictions without an explicit policy. Empty or partial configurations do not activate unrelated controls.
- Preserve the historical `ALLOW_RAW_SQL=true` write/DDL gate, CORS behavior and driver selection. Explicit denials still win over permissive switches.
- Existing policies containing formerly dormant settings now enforce those settings. Review limits and SQL restrictions before upgrading. Scoped policies reject SQL they cannot safely analyze; masked projections remain restricted and row-filtered tables are read-only.
- Invalid or missing selected policy files now prevent startup. Incompatible legacy audit tables need a new configured table name; no destructive migration is performed.
- `maxQueryCpuTime` is a wall-clock deadline, not Firebird CPU accounting or guaranteed server-side cancellation. Database privileges remain essential.

### Validation
- 173 automated tests, TypeScript build and compiled CLI/MCP smoke checks passed.
- Disposable Firebird 2.5.9 integration passed, including the #36 query, related functions, default compatibility and explicitly configured security controls.

### Maintenance
- Refresh compatible locked transitive dependencies: fast-uri 3.1.8, ip-address 10.7.2 and undici 6.29.0. Production dependency audit reports no known vulnerabilities after the update; Firebird driver versions are unchanged.

## [2.11.0-alpha.4] - 2026-09-28

### Fixed
- Fix [#36](https://github.com/PuroDelphi/mcpFirebird/issues/36): distinguish FROM inside EXTRACT, SUBSTRING and TRIM arguments from a table FROM clause. Aliased/quoted columns, nested builtin expressions and parenthesized arguments no longer cause false relation-security errors.
- Continue inspecting actual relations and nested subqueries; preserve table/catalog denials, qualified-relation rejection, row filters and masking restrictions. No security flags need to be disabled to use these functions.
- Add parser/query-boundary regressions and a disposable Firebird 2.5.9 test for the reported SQL and related functions. Compatibility defaults remain unchanged from alpha.3.

### Documentation
- Document supported function argument syntax and the existing expression-projection restriction when masking is configured, in English and Spanish.

## [2.11.0-alpha.3] - 2026-09-24

### Compatibility
- Make advanced security restrictions opt-in. Without an explicit policy, preserve catalog reads, procedures, functions, joins/CTEs and historical `ALLOW_RAW_SQL=true` write/DDL behavior.
- Remove implicit row/response limits, query deadlines, rate limits and process-lifetime query quotas. Partial resource policies activate only the supplied limits; empty sections activate no advanced controls.
- Preserve baseline SQL validation, parameterized tool filters, authentication, CORS and driver selection. Explicit operation/table/row/masking/role/catalog policies still fail closed and cannot be bypassed with the raw-write switch.
- Supersede alpha.2's restrictive defaults. Existing configuration files that explicitly contain previously dormant limits now enforce those limits; review the updated English/Spanish guides.

### Fixed
- Normalize object-shaped stored procedure results returned by the pure-JavaScript driver before BLOB resolution, masking and limits.
- Exclude temporary test/cache files and tarballs from the published package.
- Add compatibility and opt-in regression tests, including long-lived sessions, large results, unconfigured deadlines and a disposable Firebird 2.5.9 integration check.

### Documentation
- Explain independent activation/deactivation of controls, default behavior and policy migration in both languages, README files, environment examples and the implementation review.

## [2.11.0-alpha.2] - 2026-09-24

### Security
- Implement `sql.allowSystemTables`, `allowedSystemTables`, `allowDDL` and bounded `allowUnsafeQueries` behavior for both file and inline JSON policies. Accept `sql` at the root or inside `security`, rejecting conflicts.
- Enforce policy at the actual query boundary, including batch and analysis execution; separate fixed internal metadata/audit SQL from user-controlled SQL.
- Enforce global and role operation/table restrictions, including with `ALLOW_RAW_SQL=true`; filter metadata visibility.
- Connect row predicates, alias-aware output masking, row/UTF-8 response limits, wall-clock deadlines, query counts and token-bucket rate limiting. Reject ambiguous SQL under scoped policies instead of bypassing restrictions.
- Enforce HTTPS OAuth2 introspection and propagate verified identity to permissions. Bind HTTP/SSE sessions to their principal and disable shared event subscriptions under scoped policies.
- Connect fail-closed file/database auditing with parameterized inserts, UUID keys, intent/completion events and Firebird 2.5-compatible schema. Mask responses before auditing them.
- Fail startup on invalid selected files and invalid nested options; clear stale policy fields on initialization. No silent fallback to defaults.

### Fixed
- Prevent recursive Streamable HTTP transport shutdown discovered by the authenticated-session integration test.
- Replace misleading security documentation in English and Spanish with tested behavior, migration guidance and explicit limitations. Add an implementation review mapping the previous gaps to enforcement/tests.

### Compatibility notes
- This alpha intentionally tightens behavior. Direct DDL needs explicit operation permission, `ALLOW_RAW_SQL=true` and `allowDDL=true`. Filtered tables are read-only; masking/scoped policies restrict accepted query shapes.
- Previously dormant resource limits now apply, including to metadata queries. Review quotas before rollout. `maxQueryCpuTime` is a legacy name for a client wall-clock deadline, not a Firebird CPU quota or guaranteed server-side cancellation.
- Existing incompatible database audit tables require a new configured table name; no automatic destructive schema migration is performed.

## [2.11.0-alpha.1] - 2026-09-23

### Added
- Support `FIREBIRD_SECURITY_JSON` for trusted launchers to pass a validated security policy without creating a file, as requested in [#34](https://github.com/PuroDelphi/mcpFirebird/issues/34).
- Preserve file-source precedence, enforce a 64 KiB UTF-8 limit, and reject unknown top-level policy fields without logging inline contents.

### Security
- Reject initialization when the selected inline policy is empty, malformed, invalid, or oversized, instead of silently using defaults.
- Initialize the standalone HTTP entry point's process-wide policy before opening its listening socket.
- Add policy enforcement, source precedence, startup rejection, size-boundary, and error-redaction regression coverage.

### Documentation
- Document MCP environment examples, PowerShell setup, file precedence, restart requirements, and how a trusted appsettings.json launcher should pass JSON.

## [2.10.0] - 2026-09-23

### Added
- Promote all changes from `2.10.0-alpha.1` and `2.10.0-alpha.2` since stable `2.9.3`.
- Add `get-table-indexes`, `get-table-constraints`, and `get-table-triggers` for clients that cannot autonomously read MCP Resource Templates (#33).
- Include ordered index columns, foreign-key references, and CHECK source in shared tool/resource metadata.

### Fixed
- Load security configuration from CLI and environment variables across server entry points, with JSON and trusted CommonJS support in the ESM runtime (#34). File loading confirmed by the reporter.
- Validate the `--security-config` argument and document configuration precedence, formats, restart instructions, and fallback behavior.

### Maintenance
- Update the locked transitive `qs` dependency from 6.15.3 to 6.16.0.
- Expand regression tests and add a compiled-runtime MCP security smoke test.

## [2.10.0-alpha.2] - 2026-09-22

### Fixed
- Load custom security policies during no-argument initialization in all server entry points, using `FIREBIRD_SECURITY_CONFIG`, `SECURITY_CONFIG`, or the documented `SECURITY_CONFIG_PATH` alias.
- Honor `--security-config` in the CLI with precedence over environment variables and reject missing option values.
- Load JSON and trusted CommonJS configuration files correctly in the published ESM runtime, including UTF-8 BOM JSON files. Fixes [#34](https://github.com/PuroDelphi/mcpFirebird/issues/34).
- Document file formats, precedence, restart instructions, and the existing fallback behavior for invalid configurations.

## [2.10.0-alpha.1] - 2026-09-07

### Added
- Added `get-table-indexes`, `get-table-constraints`, and `get-table-triggers` tools for MCP clients that cannot autonomously read Resource Templates.
- Index metadata now includes ordered columns, uniqueness, direction, and segment count.
- Constraint metadata now includes local columns, referenced table and columns for foreign keys, and CHECK source when available.

### Changed
- Tools and the corresponding table Resource Templates now share the same metadata implementation, keeping their authorization checks and results consistent. Implements [#33](https://github.com/PuroDelphi/mcpFirebird/issues/33).

## [2.9.3] - 2026-08-31

### Fixed
- Resolved native-driver BLOB objects while their transaction is active, returning UTF-8 text instead of driver attachment internals.
- Detect BLOB columns across all result rows, including when the first row contains `NULL`.
- Close native BLOB streams reliably and prevent unresolved objects from being serialized. Resolves [#31](https://github.com/PuroDelphi/mcpFirebird/issues/31).

### Changed
- Upgraded the HTTP runtime from Express 4 to Express 5 and removed the obsolete `array-flatten` dependency chain.
- Removed unused direct dependencies on `winston`, `node-fetch`, and `eventsource`, reducing the installed dependency tree by more than 100 packages.
- Preserved the optional native Firebird driver and its installation behavior for compatibility.

### Security
- Prevented native attachment and connection details from leaking through BLOB serialization.
- Production dependency auditing reports zero known vulnerabilities.

## [2.9.2] - 2026-08-29

### Security
- Replaced free-form `get-table-data` clauses with structured, parameterized filters, validated identifiers, and bounded pagination.
- Disabled raw SQL writes by default; trusted deployments can opt in with `ALLOW_RAW_SQL=true`.
- Added consistent timing-safe Bearer authentication and configurable CORS across HTTP transports.
- Removed unsafe URL/CLI environment mutation and reduced sensitive information in responses and logs.
- Updated vulnerable transitive dependencies; production dependency auditing reports zero vulnerabilities.

### Fixed
- Restored schema, trigger, and statistics resources for Firebird 5 and Dialect 1 by avoiding reserved aliases and decoding trigger-source BLOB buffers.
- Applied table authorization and parameterized metadata queries to database resources.

### Documentation
- Documented `MCP_ALLOWED_ORIGIN`, `FIREBIRD_API_KEY`, `ALLOW_RAW_SQL`, browser compatibility, and the structured `get-table-data` migration format.

## [2.9.3-alpha.2] - 2026-08-31

### Fixed
- Resolved native-driver BLOB objects through `openBlob` while their transaction is still active, returning UTF-8 text instead of driver internals.
- Detect BLOB columns across all result rows, including when the first row contains `NULL`.
- Prevent unresolved object values from being stringified and exposing native attachment details.
- Added regression coverage for native BLOB streams, first-row `NULL` values, cleanup, and serialization safety. Resolves [#31](https://github.com/PuroDelphi/mcpFirebird/issues/31).

## [2.9.3-alpha.1] - 2026-08-29

### Changed
- Upgraded the HTTP runtime from Express 4 to Express 5 and removed the obsolete `array-flatten` dependency chain.
- Removed unused direct dependencies on `winston`, `node-fetch`, and `eventsource`; logging already uses the internal stderr-safe logger.
- Reduced the installed dependency tree by more than 100 packages without changing native-driver installation or behavior.

### Security notes
- `ajv`, `cross-spawn`, and `eventsource` remain transitive runtime dependencies of the official MCP SDK.
- `node-gyp` remains part of the optional native Firebird driver, which is intentionally unchanged for compatibility.
- Network-access findings are expected for HTTP/SSE transports and Firebird database connections; they are capabilities, not confirmed vulnerabilities.

## [2.9.2-alpha.2] - 2026-08-29

### Fixed
- Renamed the schema column alias from reserved keyword `POSITION` to `FIELD_POSITION` for Firebird 5 and Dialect 1 compatibility.
- Renamed the statistics count alias from reserved context name `ROW_COUNT` to `TOTAL_ROWS`.
- Converted trigger-source BLOB buffers to UTF-8 text before trimming them.
- Added regression tests for the three database resource failures reported in [#30](https://github.com/PuroDelphi/mcpFirebird/issues/30).

## [2.9.2-alpha.1] - 2026-08-27

### Security
- Replaced free-form `where` and `orderBy` input in `get-table-data` with structured filters, parameterized values, validated identifiers, and bounded pagination.
- Raw `INSERT`, `UPDATE`, `DELETE`, and DDL queries are disabled by default. Trusted deployments can restore this behavior with `ALLOW_RAW_SQL=true`.
- Removed HTTP query-string and CLI `--env` mutation of global environment configuration.
- Added timing-safe Bearer-token validation to every HTTP server entry point.
- Removed database connection details, request bodies, SQL text, stack traces, and internal error details from client responses and routine logs.
- Limited HTTP request bodies to 1 MB and updated vulnerable transitive dependencies; `npm audit` now reports zero vulnerabilities.

### Changed
- CORS remains compatible with existing MCP clients by allowing all origins by default, but browser credentials are disabled. Set `MCP_ALLOWED_ORIGIN` to one or more comma-separated origins to restrict browser access.
- Database metadata resources now use parameterized queries and enforce configured table authorization rules.

### Migration notes
- Existing STDIO and Bearer-token clients require no CORS changes.
- Browser clients that use `Authorization: Bearer` continue to work with the default configuration.
- Deployments that execute raw write queries must explicitly set `ALLOW_RAW_SQL=true`; using a restricted Firebird database user is strongly recommended.
- The old `get-table-data.where` and string `get-table-data.orderBy` arguments must be migrated to `filters` and structured `orderBy` entries.

## [2.9.1] - 2026-08-27

### Fixed
- Restored all database resources in modern MCP server entry points.
- Migrated resource identifiers to standard `firebird://` URIs.
- Registered parameterized table resources with the MCP SDK `ResourceTemplate` API so they appear in `resources/templates/list` and can be read by strict MCP clients.
- Added end-to-end MCP tests for static resource discovery, template discovery, and resource reads. Resolves [#30](https://github.com/PuroDelphi/mcpFirebird/issues/30).

## [2.9.0] - 2026-08-19

### Added
- Native API-key authorization for HTTP transports when `FIREBIRD_API_KEY` is configured.
- Configurable CORS restrictions through `MCP_ALLOWED_ORIGIN`.
- Regression coverage for connection-pool recovery and MCP query output compatibility.

### Changed
- `execute-query` and `execute-batch-queries` now return object-shaped payloads (`rows` and `results`) for strict MCP clients such as Gemini CLI.
- Database tool descriptions, resource responses, and propagated server errors are now consistently returned to LLM clients in English.
- Streamable HTTP is prioritized in the example environment and Docker configuration.
- The connection pool now validates reused connections, recycles idle connections, and recovers after failed connection attempts.
- Native-driver connection handling now releases failed or discarded handles more reliably.

### Security
- Removed dynamic code execution and unsafe configuration mutation paths.
- Removed backup and restore tools that depended on external shell commands.
- Pinned `range-parser` to `1.2.1` as a supply-chain precaution.
- Excluded local `.env` files from npm packages.

### Fixed
- Fixed MCP schema validation failures reported in [#29](https://github.com/PuroDelphi/mcpFirebird/issues/29). Thanks to @polina-lopatniuk for reporting and verifying the fix.

## [2.8.4] - 2026-06-25

### 🛡️ Security Hotfix
- **Mitigación de Riesgo de Cadena de Suministro**: Se forzó la versión de `range-parser` a la `1.2.1` mediante overrides para evitar el uso de la versión `1.3.0` publicada por un nuevo colaborador, mitigando una posible vulnerabilidad o ataque de cadena de suministro.
- **Actualización de dependencias internas**: Se actualizaron otras dependencias internas que presentaban vulnerabilidades mediante `npm audit fix`.

## [2.8.3] - 2026-06-25

### 🛡️ Security Hotfix
- **Eliminación de Módulo Vulnerable (`child_process`)**: Se eliminaron por completo las herramientas de gestión de backups y restore, las cuales dependían de ejecutar binarios externos mediante `child_process.spawn()`, mitigando así vulnerabilidades de "Acceso Shell" (Ejecución de Comandos del Sistema).

## [2.8.2] - 2026-06-25

### 🛡️ Security Hotfix
- **Eliminación de Ejecución Dinámica (eval)**: Se reemplazó el uso de `new Function` por `import()` nativo en la carga dinámica del driver de base de datos (`driver-factory`), eliminando falsos positivos en el escaneo de seguridad y mitigando la alerta de ejecución dinámica (eval).

## [2.8.1] - 2026-06-25

### 🛡️ Security Hotfix
- **Eliminación de Ejecución Dinámica (eval)**: Se eliminó el soporte de `rowFilters` (experimental) que usaba `new Function` para compilar SQL a JS en tiempo de ejecución, cerrando una grave brecha de seguridad de ejecución de código arbitrario.
- **Autenticación Nativa EMA en HTTP**: Se implementó un middleware de seguridad estricto para rutas HTTP (`/mcp`, `/sse`, `/messages`) que exige el uso de tokens Bearer (`Authorization: Bearer <API_KEY>`) si `FIREBIRD_API_KEY` está configurada, protegiendo despliegues remotos.
- **Limpieza de Middleware Inseguro (Smithery)**: Se borró por completo el middleware residual que modificaba `process.env` utilizando los parámetros (query strings) de la URL, eliminando el riesgo de envenenamiento de configuración (Global Secret/Config Poisoning).
- **Restricción de CORS**: Se endurecieron las directivas CORS y ahora el origen puede ser restringido de forma segura mediante la variable `MCP_ALLOWED_ORIGIN`.
- **Limpieza de Instalación**: Eliminación de script `postinstall` en el `package.json` para no desencadenar falsos positivos de riesgos de cadena de suministro (Supply Chain Risk).

## [2.8.0] - 2026-06-25

### 🚀 Novedades y Mejoras (Release Estable)
- **Documentación Renomada y Optimizada**: Toda la documentación ahora refleja los estándares MCP 2.7+.
- **Modernización del Transporte (Streamable HTTP)**: Establecido como estándar preferido en todas las configuraciones Docker y CLI.
- **Eventos Proactivos**: Soporte nativo para `POST_EVENT` de Firebird mediante driver nativo, posibilitando notificaciones en tiempo real al cliente.
- **Autorización Gestionada (EMA)**: Implementación segura de autenticación mediante API Key para entornos expuestos o en la nube.
- **Docker Optimizado**: El `Dockerfile` ahora incluye el soporte nativo compilado, permitiendo Wire Encryption y Eventos Proactivos fuera de la caja.

## [2.7.0] - 2026-06-25

### 🙏 Agradecimiento Especial
- Un agradecimiento inmenso a **@arvanus** por su excelente contribución en el **PR #23**. Gracias a su trabajo, se ha solucionado el problema crítico de truncamiento de metadatos en campos BLOB leyendo dichos campos de manera nativa. ¡Gracias por ayudar a mejorar la compatibilidad del conector!

### 🚀 Novedades y Mejoras
- **Arquitectura Modular MCP:** Implementación de una nueva estructura modular compatible tanto con la capa de transporte tradicional **stdio** como con el nuevo **Streamable HTTP** (Preparando el terreno para MCP 2.3+).
- **Reducción Extrema de Tamaño:** Se implementó un `.npmignore` estricto que excluye videos, archivos de desarrollo y código fuente de TypeScript. El peso del paquete se ha reducido drásticamente de **~23 MB a tan solo 170 KB**, permitiendo descargas ultrarrápidas.
- **Limpieza de Dependencias Inseguras:** 
  - Se movió `@modelcontextprotocol/inspector` a las dependencias de desarrollo (`devDependencies`), eliminando fugas de memoria reportadas en producción.
  - Se removió por completo la librería antigua de `glob`, eliminando todas las advertencias de seguridad graves al momento de instalar el paquete.
- **Solución al Timeout:** Al resolver los problemas de peso y dependencias obsoletas, se eliminó de raíz el error `context deadline exceeded` que afectaba a clientes como Claude Desktop y Antigravity en el primer arranque.

## [2.7.0-alpha.3] - 2025-12-04

### Fixed
- **Firebird 5.0 Compatibility**: Fixed VARCHAR size limit error in metadata tools
  - Changed CAST to VARCHAR(8000) instead of VARCHAR(32000) for BLOB source code fields
  - Resolves "Data type unknown, Implementation limit exceeded" error in Firebird 5.0 with DataTypeCompatibility = 3.0
  - Affects: describe-trigger, describe-procedure, describe-function, describe-package
  - VARCHAR(8000) is safe for all character sets (UTF8, NONE, ISO8859_1) in both Firebird 3.0 and 5.0

## [2.7.0-alpha.2] - 2025-11-30

### Fixed
- **BLOB Source Code Retrieval**: Fixed metadata tools returning BLOB objects instead of text
  - Added CAST to VARCHAR(32000) for all source code BLOB fields
  - Affects: describe-trigger, describe-procedure, describe-function, describe-package
  - Source code now correctly returned as readable strings

## [2.7.0-alpha.1] - 2025-11-19

### Added
- **Database Metadata Tools**: New tools for inspecting database objects
  - `list-triggers`: List all triggers in the database with table, type, and status information
  - `describe-trigger`: Get detailed information about a specific trigger including source code
  - `list-procedures`: List all stored procedures with parameter information
  - `describe-procedure`: Get detailed information about a specific stored procedure including source code
  - `list-functions`: List all functions (UDFs and PSQL functions)
  - `describe-function`: Get detailed information about a specific function including source code
  - `list-packages`: List all packages (Firebird 3.0+)
  - `describe-package`: Get detailed information about a specific package including header and body source
- **Security Integration**: All new metadata tools respect the security configuration
  - Tools check for EXECUTE operation permission before accessing metadata
  - Follows the same authorization pattern as existing database tools

### Development
- Started development of version 2.7.0
- Ready for new features and improvements

## [2.6.0] - 2025-10-24

### Added
- **HTTP Streamable Transport**: Modern MCP protocol (2025-03-26) with bidirectional communication
- **Unified Transport Mode**: Supports both SSE and Streamable HTTP simultaneously with auto-detection
- **Stateless Mode**: Full support for stateless HTTP operations compatible with MCP Inspector
- **Enhanced Documentation**: Comprehensive transport types documentation covering all 4 modes (STDIO, SSE, HTTP Streamable, Unified)

### Fixed
- **get-server-info tool**: Fixed hardcoded version number - now reads dynamically from package.json
- **get-execution-plan tool**: Simplified to return informative message instead of attempting unsupported operations
  - Removed legacy code using isql-specific commands (SET PLANONLY/SET PLAN)
  - Provides clear guidance on using Firebird tools (isql, FlameRobin, IBExpert)
  - Suggests analyze-query-performance as alternative
- **HTTP Transport**: Fixed port configuration not being respected
- **Environment Variables**: Complete .env.example with all configuration options

### Changed
- **Default Transport**: HTTP Streamable is now the recommended transport for web clients
- **Port Selection**: Improved logic to respect user-specified ports
- **Security**: Enhanced security configuration and documentation

### Technical Notes
- Research confirmed node-firebird drivers don't expose execution plan API (isc_dsql_sql_info)
- HTTP transport now properly implements stateless mode following official MCP SDK patterns
- All transport modes tested and verified with MCP Inspector

## [2.6.0-alpha.12] - 2025-10-24

### Fixed
- **get-server-info tool**: Fixed hardcoded version number
  - Now reads version dynamically from package.json instead of using hardcoded "2.2.0-alpha.1"
  - Also reads name and description from package.json for consistency
  - Version now correctly reflects the actual running version

## [2.6.0-alpha.11] - 2025-10-24

### Changed
- **get-execution-plan tool**: Simplified implementation to return informative message
  - Removed all legacy code attempting to use SET PLANONLY/SET PLAN commands (isql-specific, not supported by drivers)
  - Removed attempts to use non-existent getPlan() and getInfo() methods
  - Now returns clear explanation that execution plan retrieval is not available through Node.js Firebird drivers
  - Provides detailed recommendations for using Firebird tools (isql, FlameRobin, IBExpert)
  - Suggests using analyze-query-performance tool as alternative for performance analysis

### Technical Notes
- Research confirmed that node-firebird-driver-native and node-firebird do not expose isc_dsql_sql_info API
- The Firebird API provides isc_info_sql_get_plan (constant: 22) but this is not available in high-level driver interfaces
- Low-level node-firebird-native-api would be needed but requires significant refactoring
- FDB (Python driver) successfully uses: isc_dsql_sql_info(statement_handle, [isc_info_sql_get_plan])

## [2.6.0-alpha.10] - 2025-10-24

### 🔧 Fixed
- **get-execution-plan Tool**: Fixed API method for retrieving execution plans with native driver
  - Changed from non-existent `statement.getPlan()` to `statement.getInfo([22])` (isc_info_sql_get_plan)
  - Uses correct Firebird API constant (22 = isc_info_sql_get_plan) to retrieve execution plan
  - Properly handles getInfo() response to extract plan string
  - Falls back to legacy method if getInfo() is not available or fails
  - **This should now correctly retrieve execution plans using the native driver API**

## [2.6.0-alpha.9] - 2025-10-24

### 🔧 Fixed
- **Native Driver Detection**: Fixed detection of native driver in `get-execution-plan` tool
  - Now uses `DriverFactory.getDriverInfo()` instead of `process.env.USE_NATIVE_DRIVER`
  - Properly detects when native driver is active and configured
  - Added debug logging to show driver detection status
  - **This should now correctly use `getPlan()` API when `--use-native-driver` flag is set**

## [2.6.0-alpha.8] - 2025-10-24

### 🔧 Fixed
- **get-execution-plan Tool**: Implemented proper native driver support using Firebird API's `getPlan()` method
  - Now uses `statement.getPlan()` from node-firebird-driver-native for accurate execution plans
  - Properly prepares statement, retrieves plan, and cleans up resources (statement, transaction, attachment)
  - Falls back to legacy methods if native driver is not available or fails
  - Improved error handling and logging for debugging
  - **Important**: `SET PLANONLY` and `SET PLAN` are isql-specific commands and don't work through programmatic drivers

### 📝 Technical Details
- Native driver creates attachment, starts transaction, prepares statement, and calls `getPlan()` API method
- Legacy fallback attempts `SET PLAN ON` for pure-js driver (limited functionality)
- Comprehensive resource cleanup in all code paths (success and error)

## [2.6.0-alpha.7] - 2025-10-24

### 🔧 HTTP Streamable Transport Fixes
- **Fixed Stateless Mode**: Implemented correct stateless pattern following official MCP SDK documentation
- **Port Configuration Bug**: Fixed issue where `--http-port` parameter was being ignored
- **Transport Priority**: HTTP_PORT now correctly prioritized for HTTP transport type
- **Shared Server Instance**: Optimized to reuse server instance while creating new transport per request
- **MCP Inspector Compatibility**: Now works correctly with MCP Inspector without requiring session management

### 📚 Examples Modernization
- **New Examples Structure**: Organized examples into config/, clients/, and legacy/ folders
- **TypeScript Client**: Added modern Streamable HTTP client example
- **Python Client**: Added Python client example with requirements.txt
- **JavaScript Client**: Added JavaScript client example
- **Configuration Examples**: Added Claude Desktop, VS Code, and environment variables examples
- **Legacy SSE**: Moved deprecated SSE examples to legacy/ folder

### 🧹 Project Cleanup
- **Removed 40+ Temporary Files**: Cleaned up test scripts, temporary files, and legacy code
- **Updated .gitignore**: Added patterns to prevent temporary files from being committed
- **Removed Legacy Proxy**: Deleted mcp-sse-proxy folder and related files
- **Removed Old Release Notes**: Consolidated release notes into CHANGELOG.md
- **Better Organization**: Cleaner project structure for easier maintenance

### 📖 Documentation
- **Examples README**: Comprehensive guide for all example types
- **Transport Types**: Updated documentation to reflect stateless as default
- **Configuration Guide**: Enhanced with modern examples

### ✅ Compatibility
- Fully backward compatible with previous alpha versions
- Stateless mode is now default (can be changed with STREAMABLE_STATELESS_MODE=false)
- All existing STDIO and SSE integrations continue to work

## [2.6.0-alpha.2] - 2025-01-22

### 🔄 Sync with Main
- Synced with main branch v2.5.1 release
- Ready for next development cycle

## [2.5.1] - 2025-01-22

### 🌐 Smithery Platform Support
- **Official Smithery Integration**: One-click cloud deployment support
- **Smithery Configuration**: Complete smithery.yaml and smithery.config.js
- **HTTP/Streamable Transport**: Optimized entry points for web-based deployment
- **Comprehensive Documentation**: docs/smithery-deployment.md with step-by-step guide
- **README Updates**: Added Smithery quick start section

### 🔒 Enhanced Wire Encryption
- **Improved Documentation**: Clearer wire encryption setup instructions
- **Security Emphasis**: Highlighted enterprise-grade encryption capabilities
- **Configuration Examples**: Multiple scenarios for wire encryption setup
- **Verification Tools**: Built-in encryption status checks

### 📚 Documentation Improvements
- **RELEASE_NOTES_v2.5.1.md**: Comprehensive release documentation
- **Smithery Quick Start**: Easy-to-follow deployment guide
- **Wire Encryption Guide**: Enhanced security documentation
- **Configuration Examples**: Real-world deployment scenarios

### ✅ Compatibility
- Fully backward compatible with v2.5.0
- All existing deployments continue to work
- No breaking changes

## [2.6.0-alpha.1] - 2025-01-22

### 🔄 Smithery Integration
- **Merged Smithery compatibility** from smithery/config-u9cv branch
- All Smithery deployment features now available in alpha branch
- No breaking changes to existing STDIO functionality

## [2.6.0-alpha.0] - 2025-01-22

### 🎯 MCP Modernization 2025

This release brings the MCP Firebird server fully up-to-date with the latest Model Context Protocol specifications and best practices.

#### 🌐 Smithery Platform Compatibility
- **Updated Smithery Entry Points**: All Smithery deployment files now use modern MCP APIs
  - `src/smithery-entry.ts`: Updated with modern registration APIs and capabilities
  - `src/http-entry.ts`: Updated HTTP transport with modern APIs and capabilities
  - `src/smithery.ts`: Added capabilities declaration
- **Fixed smithery.yaml**: Corrected configSchema to proper JSON Schema format
  - Changed from flat property structure to proper `type`, `required`, and `properties` format
  - Added `enum` for logLevel field
- **Type Compatibility**: Fixed all TypeScript type issues for Smithery deployment
  - Prompt handlers now ensure correct role types (user/assistant)
  - Resource handlers now accept URL parameter instead of string
  - Proper ZodRawShape extraction for all schemas
- **Build Verification**: ✅ Successful compilation with zero TypeScript errors

#### ✅ API Modernization
- **Updated Tool Registration**: Migrated from `server.tool()` to `server.registerTool()` with modern signature
  - Separated `title` and `description` in options object
  - Direct parameter access in handlers (no more `extra` wrapper)
  - Better schema validation with ZodRawShape extraction

- **Updated Prompt Registration**: Migrated from `server.prompt()` to `server.registerPrompt()`
  - Changed `inputSchema` to `argsSchema` for clarity
  - Improved parameter handling
  - Consistent options structure

- **Updated Resource Registration**: Migrated from `server.resource()` to `server.registerResource()`
  - Added `mimeType` support
  - Enhanced metadata with title and description
  - Direct URI parameter in handlers

#### 🔧 Capabilities Declaration
- **Explicit Capabilities**: All servers now declare capabilities with `listChanged` flags
  - `tools: { listChanged: true }`
  - `prompts: { listChanged: true }`
  - `resources: { listChanged: true, subscribe: false }`
- Better client interoperability
- Clear feature advertisement

#### 📦 Schema Handling
- **Zod Integration**: Automatic extraction of `ZodRawShape` from `ZodObject` schemas
- **Type Safety**: Improved TypeScript types for all handlers
- **Validation**: Maintained Zod validation while adapting to SDK requirements

#### 🗂️ Code Organization
- **Legacy Code Marked**: `create-server.ts` marked as deprecated with clear migration path
- **Type Definitions Updated**: Modern capability types in `modelcontextprotocol.d.ts`
- **Build Configuration**: Excluded test files from production builds

#### 📚 Documentation
- **New Guide**: Added `docs/mcp-modernization-2025.md` with complete migration guide
- **API Examples**: Updated examples showing before/after patterns
- **Best Practices**: Documented modern MCP patterns and recommendations

#### 🔄 Backwards Compatibility
- **Legacy Mode**: Preserved legacy server implementation (use `USE_LEGACY_SERVER=true`)
- **No Breaking Changes**: Existing configurations continue to work
- **Gradual Migration**: Users can migrate at their own pace

#### 🛠️ Developer Experience
- **Cleaner Code**: Removed unused imports and deprecated patterns
- **Better Errors**: Improved error messages and logging
- **Type Safety**: Enhanced TypeScript support throughout

### Technical Details
- SDK Version: `@modelcontextprotocol/sdk ^1.13.2`
- Node.js: 18+ required
- TypeScript: Strict mode enabled
- Build: Successful with zero errors

### Migration Notes
- No changes required for existing users
- New implementations should use modern APIs
- See `docs/mcp-modernization-2025.md` for detailed migration guide

## [2.2.0] - 2025-06-27

### 🚀 Major Features Added
- **SSE Transport Support**: Full implementation of Server-Sent Events transport for MCP Inspector compatibility
- **Backwards Compatible Server**: Official MCP SDK implementation supporting both Streamable HTTP and SSE
- **Multi-Protocol Support**: Single server instance supporting STDIO, SSE, and HTTP transports simultaneously
- **Windows Path Handling**: Proper escaping and handling of Windows file paths with backslashes

### 🔧 Technical Improvements
- **MCP SDK v1.13.2**: Updated to latest Model Context Protocol TypeScript SDK
- **Modern API Implementation**: Using official registerTool(), registerPrompt() methods
- **Session Management**: Robust session handling for HTTP-based transports
- **Error Handling**: Enhanced error handling and logging throughout the application
- **Express Integration**: Clean Express.js integration for HTTP endpoints

### 🌐 New Endpoints
- **Modern Streamable HTTP**: `POST/GET/DELETE /mcp` for latest MCP clients
- **Legacy SSE**: `GET /sse` for backwards compatibility
- **Legacy Messages**: `POST /messages` for older client support

### 🛠️ Developer Experience
- **MCP Inspector Support**: Full compatibility with both STDIO and SSE transports
- **Improved Logging**: Detailed debug and info logging for troubleshooting
- **Better Documentation**: Comprehensive examples and configuration guides

### 🔒 Stability & Compatibility
- **STDIO Preserved**: All existing STDIO functionality maintained without changes
- **Production Ready**: Thoroughly tested with real Firebird databases
- **Cross-Platform**: Enhanced Windows and Linux compatibility

### 📊 Testing & Verification
- **Database Connections**: Tested with multiple Firebird database files
- **Transport Reliability**: Stable SSE connections without ECONNRESET errors
- **Inspector Integration**: Verified working with MCP Inspector on both transports
## [2.1.0] - 2024-07-27

### Added
- Added `execute-batch-queries` tool for executing multiple SQL queries in parallel
- Added `describe-batch-tables` tool for retrieving schema information of multiple tables in parallel
- Added modern McpServer implementation following the latest MCP recommendations
- Added support for ResourceTemplate for more flexible resource definitions
- Added improved error handling with more detailed logging
- Added implementation of modern McpServer as default server
- Added backward compatibility with legacy Server implementation

### Fixed
- Fixed issue with field descriptions not being properly retrieved from Firebird BLOB fields
- Improved SQL queries for retrieving field descriptions using CAST to VARCHAR
<<<<<<< HEAD
=======
- Fixed hardcoded localhost values in connection handling by replacing with 127.0.0.1
- Improved Smithery integration by passing parameters directly as command line arguments
- Enhanced error messages for connection issues with more specific troubleshooting guidance
- Added support for firebirdHost, firebirdPort, etc. parameters in addition to host, port, etc.
- Updated smithery.yaml with better example configuration
- Improved SSE transport implementation for better compatibility with modern clients

## [2.0.11-alpha.3] - 2024-07-27

### Added
- Added `describe-batch-tables` tool for retrieving schema information of multiple tables in parallel
- Improved performance for database schema analysis operations

## [2.0.11-alpha.2] - 2024-07-27

### Added
- Added `execute-batch-queries` tool for executing multiple SQL queries in parallel
- Improved performance for batch database operations

## [2.0.11-alpha.1] - 2024-07-27

### Added
- Added implementation of modern McpServer as default server
- Added backward compatibility with legacy Server implementation

## [2.0.11-alpha.0] - 2024-07-27

### Added
- Added modern McpServer implementation following the latest MCP recommendations
- Added support for ResourceTemplate for more flexible resource definitions
- Added improved error handling with more detailed logging

### Fixed
>>>>>>> alpha
- Fixed hardcoded localhost values in connection handling by replacing with 127.0.0.1
- Improved Smithery integration by passing parameters directly as command line arguments
- Enhanced error messages for connection issues with more specific troubleshooting guidance
- Added support for firebirdHost, firebirdPort, etc. parameters in addition to host, port, etc.
- Updated smithery.yaml with better example configuration
- Improved SSE transport implementation for better compatibility with modern clients

## [2.0.10] - 2024-07-27

### Added
- Added new `sse` script for easier development with Server-Sent Events
- Added example video showing MCP Firebird in action with Claude
- Added information about Asistentes Autónomos as another way to support the project

### Changed
- Updated Dockerfile to include new STDIO mode scripts
- Updated Docker documentation for STDIO mode with MCP Inspector
- Improved parameter typing in database.ts for better code quality
- Updated README files with more comprehensive examples and documentation

## [2.0.10-alpha.0] - 2024-07-10

### Changed
- Updated Dockerfile to include new STDIO mode scripts
- Updated Docker documentation for STDIO mode with MCP Inspector

## [2.0.9] - 2024-07-10

### Fixed
- Fixed environment variable handling in STDIO mode with MCP Inspector
- Added hardcoded default database path as fallback when environment variables are not set
- Improved batch file creation for running MCP Firebird with Inspector

## [2.0.8] - 2024-07-01

### Added
- Added support for SSE transport
- Added support for MCP Inspector
- Added support for multiple database connections

### Fixed
- Fixed issues with environment variables
- Fixed issues with CLI parameters

## [2.0.7] - 2024-06-15

### Added
- Initial release with basic functionality
- Support for Firebird database connections
- Support for executing SQL queries
- Support for listing tables and views
