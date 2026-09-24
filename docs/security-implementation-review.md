# Security implementation review — 2.11.0-alpha.3

Date: 2026-09-24. Scope: security claims in `README.md`, `README.es.md`, `docs/security.md`, its Spanish counterpart, metadata/transport documentation, and the source paths implementing those claims. This is an implementation review and regression suite, not an independent penetration-test certification.

## Findings and changes

The alpha.3 compatibility correction makes advanced controls opt-in. No configuration means historical SQL support and no implicit row/size/deadline/count/rate limits. Empty sections have the same behavior, and partially configured limits do not populate unrelated limits. Explicit policies remain enforced, including previously dormant fields in existing configuration files. The legacy raw-write gate and validation remain; CORS, drivers and authentication defaults are unchanged. The stricter defaults recorded in the alpha.2 changelog are superseded, not recommended deployment defaults.

| Previously documented capability | Gap found | Alpha implementation / validation |
| --- | --- | --- |
| SQL settings | `sql` keys were documented but absent from the schema and enforcement. | Validated file/inline schema; catalog read allowlist, DDL gates and bounded trusted-query opt-in. Conflicting/unknown keys rejected. |
| Operation restrictions | `ALLOW_RAW_SQL=true` returned before checking the policy. | Global allow/deny lists always checked; role permissions intersect with them. |
| Table restrictions | Checks existed in selected tools, not arbitrary SQL execution. | User-query boundary enforcement, conservative single-table mode, metadata visibility/access checks. Unsupported SQL is denied. |
| Row filtering | Configuration existed but queries did not consume it. | Derived-table predicate before user WHERE/pagination/aggregation. Filtered tables reject writes. |
| Masking | Helper was disconnected and returned original data after errors. | Applied after BLOB resolution, aliases tracked, ambiguous projections rejected, errors withhold results. |
| Row/response limits | Helpers were disconnected; response size was an object-memory estimate. | Lower row cap enforced; actual UTF-8 JSON measurement; aggregate tool/resource response checks. |
| Query count/rate | Helpers were disconnected; rate calculation could reject the first call. | Per-security-identity counters and refillable token bucket. State is bounded and is not reset by client-selected MCP session IDs. |
| Query/CPU timeout | Values were not used to bound execution. | Attachment/query/BLOB wall-clock deadline, disposal of timed-out and late connections. Actual Firebird CPU accounting is not available through these drivers. |
| OAuth/roles | Introspection helper was not connected to transport/query permissions and did not require active tokens. | HTTPS RFC 7662-style introspection, active/expiry/scope/identity validation, request-local identity, role checks, principal-bound HTTP/SSE sessions. |
| Audit logging | Query execution did not call the audit helper; file newline, SQL parsing and database key/schema issues existed. | Intent/completion/failure events; JSONL, parameterized database inserts with UUIDs, Firebird 2.5-compatible schema, fail-closed sink errors and masked response logs. |
| File configuration | Invalid selected files silently continued with defaults; nested unknown options could disappear. | Startup rejection, strict nested schemas, stale-field removal on reinitialization. |
| Shared event manager | Global state cannot safely isolate role-restricted users. | Event tools/resources withheld under scoped policies rather than representing them as per-user isolated. |

The integration test also exposed recursive transport shutdown (`onclose` calling `server.close()` which re-entered the transport). The callback now only removes its session record.

## Verification

```bash
npm run build
npm test -- --runInBand
```

Regression tests include SQL/schema validation, catalog denial/allowlists, DDL gate combinations, nested/CTE/join/UNION bypass attempts, row-filter OR/pagination handling, masking aliases and failure behavior, actual query dispatch with mocked I/O, row/size/rate/count limits, query deadlines, audit failures, OAuth claims and real MCP HTTP session ownership.

Compatibility regressions additionally cover catalog reads, executable/selectable procedures, functions, joins/CTEs, historical raw writes/DDL, baseline validation, more than 1,000 returned rows, more than 100 queries, no implicit five-/ten-second deadline, independent partial policies and explicit denials winning over permissive flags. The real-driver procedure test exposed object-shaped results; these are now normalized to rows before BLOB resolution and output controls.

An additional **real Firebird 2.5.9** smoke test passed on a disposable local database, covering filtering, alias masking, metadata visibility, catalog reads, DDL denial/permission and both audit destinations. No application database was used. Run it only when you intend to create/drop a temporary database on `127.0.0.1:3050`:

```powershell
$env:RUN_FIREBIRD_SECURITY_SMOKE = 'true'
# Optional local test account overrides; do not put production credentials here:
# $env:FIREBIRD_TEST_USER = '...'
# $env:FIREBIRD_TEST_PASSWORD = '...'
node scripts/security-firebird-smoke.mjs
```

The script creates a unique UUID-named file below the repository's ignored `temp` directory, never attaches to an existing application database, and drops its own database afterward. It exercises the pure-JS driver; it is not evidence of live testing every Firebird version/native-driver combination.

## Boundaries that must not be advertised as implemented guarantees

- `maxQueryCpuTime` is a legacy-named wall-clock deadline, **not** a CPU quota or guaranteed server-side cancellation. Writes may commit before a timeout/audit completion failure.
- Row/response caps are checked after the driver's result materialization, **not** database memory limits. Firebird grants and database-side controls remain necessary.
- SQL policy is intentionally conservative, **not** a complete Firebird grammar or an SQL sandbox. Scoped policies reject complex/opaque SQL instead of claiming to analyze it safely.
- Masking is output redaction; it does **not** eliminate predicate/timing inference or inspect the internals of permitted views. Trusted regexes and row predicates are administrator code/data.
- OAuth introspection is implemented; automatic OAuth discovery, token issuance and user login are **not**. The trusted authorization service must validate audience and issuance policy.
- Audit is fail-closed for dispatch/response, but **not** atomic with user writes, tamper-proof, or automatically rotated.
- TLS termination, OS isolation and Firebird wire-encryption configuration remain deployment responsibilities. The `verify-wire-encryption` tool reports configuration, not a cryptographic verification of the active connection.

See the [English configuration guide](security.md) or [Spanish guide](security.es.md) for defaults and migration instructions. This review describes the alpha source; npm availability must be checked separately rather than assuming a Git push changes npm tags.
