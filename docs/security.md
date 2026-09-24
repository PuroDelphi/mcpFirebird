# Security in MCP Firebird

[Español](security.es.md)

This guide describes enforcement in **2.11.0-alpha.3**, not older npm releases. See the [security implementation review](security-implementation-review.md) and [changelog](../CHANGELOG.md).

## Important migration notice

**Advanced security is opt-in.** With no security configuration (or empty `security`/`sql` objects), this alpha preserves historical SQL support: catalog reads, stored/selectable procedures, functions, joins and CTEs remain available. There is no new implicit row/size cap, five-second deadline, 100-query quota or rate limit. Existing raw-write validation, parameterized tool filters, API-key authentication and CORS behavior remain in place. `ALLOW_RAW_SQL=true` continues to enable direct writes, including DDL, when no explicit policy forbids them.

Earlier documentation incorrectly presented disconnected security helpers as enforced protections. They are now implemented, **but apply only when configured**. Important boundaries when opting in:

- Invalid selected configuration files now stop initialization instead of falling back to defaults.
- `ALLOW_RAW_SQL=true` never bypasses explicitly configured operation restrictions or `sql.allowDDL=false`.
- Catalog restrictions activate with `sql.allowSystemTables=false` or an explicit `sql.allowedSystemTables` list. Fixed internal metadata reads remain available, subject to permissions.
- Each configured row, response, query-count, rate or deadline limit is enforced independently. Omitted limits stay inactive; metadata queries consume quotas only when configured.
- Policies restricting tables, rows, masking or roles use a conservative single-table SQL subset. Unsupported joins, CTEs, nested queries and opaque routines are rejected under these policies.
- Shared event subscriptions are unavailable with scoped policies because the legacy event manager is not isolated per user.

Do not deploy an alpha directly into production without testing representative queries. **Use a least-privilege Firebird account, not SYSDBA.** Application checks complement, but do not replace, database privileges. A permitted view may expose underlying objects; configure database views and grants accordingly.

To keep compatibility, leave security sources unset. To enable only a row cap, set `FIREBIRD_SECURITY_JSON='{"security":{"maxRows":1000}}'`; this does not activate a timeout, query quota, catalog restriction or SQL subset. Remove the property (or the selected policy source) and restart to disable it. A configured policy from an older release is still explicit: previously dormant options in that policy now take effect. Do not remove a policy indiscriminately if you depend on its permissions.

## Loading a configuration file

Precedence, highest first:

1. Explicit programmatic `initSecurity(path)` / `loadSecurityConfig(path)`.
2. CLI `--security-config <path>` (sets `FIREBIRD_SECURITY_CONFIG`).
3. `FIREBIRD_SECURITY_CONFIG`.
4. `SECURITY_CONFIG`.
5. `SECURITY_CONFIG_PATH`.
6. `FIREBIRD_SECURITY_JSON` if no file path is selected.

```json
{
  "security": {
    "allowedTables": ["EMPLOYEES", "DEPARTMENTS"],
    "allowedOperations": ["SELECT"],
    "maxRows": 100
  },
  "sql": {
    "allowSystemTables": false,
    "allowedSystemTables": [],
    "allowDDL": false,
    "allowUnsafeQueries": false
  }
}
```

```bash
node dist/cli.js --security-config /absolute/path/security-config.json
```

JSON and trusted CommonJS (`.cjs`, or `.js` in a CommonJS context) are supported. CJS executes code; never use an untrusted configuration module. JSON allows only `security` and `sql` at the root. CJS may retain other application properties, but its security policy is validated strictly. Unknown nested options, invalid regular expressions and conflicting SQL locations are rejected. Use `--security-config`, not the old documentation's incorrect `--config` example.

Missing, unreadable, malformed or invalid selected files prevent startup. No source is merged with a lower-priority source. Omitted fields use defaults. An unset source selects defaults; an explicitly invalid source does not. Restart after changes and verify `Loaded security configuration from ...` in the log.

<a id="configuración-json-sin-archivos"></a>

## Inline JSON configuration

`FIREBIRD_SECURITY_JSON` accepts the same object, including the top-level `sql` section. Alternatively, place `sql` inside `security`; **do not supply both locations**. A SQL-only object is also supported.

Example MCP client `env` fragment (keep your database connection settings):

```json
{
  "FIREBIRD_SECURITY_JSON": "{\"security\":{\"allowedOperations\":[\"SELECT\"],\"maxRows\":100},\"sql\":{\"allowSystemTables\":false,\"allowedSystemTables\":[\"RDB$PROCEDURES\",\"RDB$PROCEDURE_PARAMETERS\"],\"allowDDL\":false,\"allowUnsafeQueries\":false}}"
}
```

PowerShell:

```powershell
$env:FIREBIRD_SECURITY_JSON = '{"security":{"allowedOperations":["SELECT"]},"sql":{"allowedSystemTables":["RDB$PROCEDURES"]}}'
node dist/cli.js
```

The JSON limit is 64 KiB in UTF-8; your OS may impose a lower environment-variable limit. Empty, oversized or invalid JSON prevents initialization. Unset the variable to disable it. The loader does not log JSON contents or validation details containing secrets.

Only a trusted administrator/launcher may supply the policy. HTTP/SSE clients cannot change it through requests. For `appsettings.json`, your application must read and serialize the configuration, then pass that string to the child process environment. The MCP does not read `appsettings.json` itself. File settings take precedence: remove them to select inline JSON.

## SQL security options

| Setting | Default | Enforcement |
| --- | --- | --- |
| `sql.allowSystemTables` | Unset | Historical catalog access. Set `false` to restrict `RDB$`, `MON$` and `SEC$` reads to the allowlist; `true` allows broad reads without bypassing other permissions. |
| `sql.allowedSystemTables` | Unset | Setting a list activates a catalog allowlist unless `allowSystemTables=true`; `[]` allows none. |
| `sql.allowDDL` | Unset | Historical raw-write gate. `false` denies CREATE, ALTER, DROP, RECREATE, GRANT, REVOKE and COMMENT. `true` permits consideration of DDL, still requiring `ALLOW_RAW_SQL=true` and any configured operation permissions. |
| `sql.allowUnsafeQueries` | Unset | Historical SQL validation and routine support. `false` enables conservative parsing and blocks UNION/opaque routines; `true` allows trusted SQL such as UNION when no scoped/catalog policy conflicts. It never bypasses operation, table, row, masking, role or DDL restrictions. |

Multiple statements remain rejected. Conservative parsing activates for scoped table/row/masking/role policies, catalog restrictions or `allowUnsafeQueries=false`; it also rejects direct system-relation writes, dynamic SQL, procedural blocks and syntax it cannot verify (including comma joins/selectable procedures). These restrictions do not activate just by configuring a limit or audit log. Internal metadata reads are fixed/parameterized server SQL, not an exemption that a tool caller can request. With `allowedTables`, include any explicitly queried catalog relation there as well: permissions are cumulative.

DDL example, for a trusted administrator with matching Firebird privileges:

```json
{
  "security": {
    "allowedOperations": ["SELECT", "CREATE"],
    "forbiddenOperations": ["DROP", "ALTER", "GRANT", "REVOKE"]
  },
  "sql": { "allowDDL": true }
}
```

Also set `ALLOW_RAW_SQL=true`. If you configured `forbiddenOperations`, remove an operation from that list before permitting it; denials always win. SQL writes otherwise remain disabled. Without a SQL policy, no additional DDL switch is required.

Opaque functions and `EXECUTE PROCEDURE` keep their historical availability without restrictive policies; they do not require a new flag. They are blocked with scoped table/row/masking/role policies, catalog restrictions or `allowUnsafeQueries=false`, even if another switch is permissive: their bodies could evade those controls. Their bodies may have side effects and are not inspected. This is not a complete Firebird SQL parser or an injection-proof sandbox. Use parameterized values and database grants. The compatibility path retains the previous heuristic validation (including rejecting comments and UNION unless trusted-query opt-in is selected).

## Table and operation permissions

`allowedTables`, `forbiddenTables` and `tableNamePattern` apply at the query boundary, to table metadata access, and to listing visibility. Names are exact database identifiers: normal unquoted SQL identifiers resolve to uppercase; quoted names retain case. Table metadata tools that normalize input to uppercase check that normalized name. Routine metadata uses object names for these restrictions; trigger metadata uses its parent table.

Operation lists are unset by default: the historical raw-write gate permits SELECT/EXECUTE without `ALLOW_RAW_SQL`, and requires that flag for other operations. Configure `allowedOperations`/`forbiddenOperations` explicitly to narrow permissions; use uppercase names. An empty allowlist denies all operations; an empty denylist adds no denials. Global denials apply even with `ALLOW_RAW_SQL=true` or a permissive role. Routine metadata tools retain their `EXECUTE` gate and also require `SELECT` for the internal catalog read.

Scoped policies accept single-table statements only. Joins, CTEs, nested SELECTs, selectable procedures and DDL are rejected in this mode. Use a database-enforced view for complex reporting; the view itself must implement the required row/column restrictions. Views, triggers and routines can have indirect dependencies that text checks cannot authorize for you.

An operation policy that excludes or forbids EXECUTE also selects conservative parsing to prevent opaque routine calls hidden inside SELECT. It does not activate resource quotas or a catalog denylist.

## Row filtering and masking

```json
{
  "security": {
    "allowedTables": ["EMPLOYEES"],
    "allowedOperations": ["SELECT"],
    "rowFilters": { "EMPLOYEES": "IS_PUBLIC_PROFILE = 1" },
    "dataMasking": [
      { "columns": ["SSN"], "pattern": "^.*$", "replacement": "[REDACTED]" }
    ]
  }
}
```

Row predicates are trusted administrator-authored SQL, applied inside a derived table **before** user filtering, pagination and aggregation. User `OR` clauses cannot remove them. Parameter placeholders/subqueries in configured predicates are not supported. Tables with row filters are read-only through user SQL: inserts, updates and deletes are rejected rather than pretending to implement database-level write checks.

Masking runs after BLOB resolution and before responses or response auditing. Direct column aliases retain their source-column masking rule. `SELECT *` and simple column projections with optional aliases are supported; expression projections, duplicate output names and writes are rejected when masking is enabled. Invalid masking fails closed, never returning the unmasked original. Use trusted, efficient regex patterns. Masking is output redaction, not protection against inference from predicates/timing; use restricted database views for that threat model.

The structured `get-table-data` filters (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `isNull`, `isNotNull`) remain parameterized. Free-form `where`/`orderBy` strings are not supported. Analysis/statistics requests are subject to the same policy and can be rejected under masking if they require expression projections.

## Resource limits

```json
{
  "security": {
    "maxRows": 1000,
    "queryTimeout": 5000,
    "resourceLimits": {
      "maxRowsPerQuery": 5000,
      "maxResponseSize": 5242880,
      "maxQueryCpuTime": 10000,
      "maxQueriesPerSession": 100,
      "rateLimit": { "queriesPerMinute": 60, "burstLimit": 20 }
    }
  }
}
```

This is an **opt-in example, not the defaults**. Every limit is inactive when omitted, even inside a partially populated `resourceLimits` object. Use positive integers; remove a property to disable it (zero/null are invalid). When both row limits are configured, the lower wins. Oversized results are rejected, not silently truncated. Size is measured using UTF-8 JSON bytes; tool/resource wrappers also check aggregate responses. Row/size checks occur after driver materialization, so they are **not a database memory quota**. Use `FIRST`/`ROWS` and database-side controls to bound work.

The lower of `queryTimeout` and the legacy `maxQueryCpuTime` is a **wall-clock deadline**, including attachment/query/BLOB reading. Timed-out connections are discarded; late attachments are also closed. This does not measure Firebird CPU time or guarantee immediate server-side cancellation. A timed-out write may already have committed: never automatically retry it.

Rate limiting uses a token bucket, initially filled to `burstLimit`, refilling at `queriesPerMinute`. Each physical query—including batch iterations and metadata reads—consumes a query count. Security-session identity is process-lifetime STDIO, authenticated OAuth subject, shared API key, or unauthenticated socket IP. Opening another MCP session does not reset quotas. Counters reset on process restart; maps have a 10,000-identity ceiling and reject new identities at capacity. Increase limits deliberately for large schemas or long-running deployments.

## HTTP/SSE authentication and role permissions

Static Bearer authentication remains available through `FIREBIRD_API_KEY` (or its existing alias). Never put keys in URL parameters. Use HTTPS at your reverse proxy.

```bash
export FIREBIRD_API_KEY="replace-with-a-strong-secret"
```

With `authorization.type="basic"`, this shared key maps to the `user` role; configure its `rolePermissions`. This is static Bearer authentication, not an HTTP Basic password database. Without role configuration, authenticated requests have no database permissions.

For OAuth2:

```json
{
  "security": {
    "authorization": {
      "type": "oauth2",
      "oauth2": {
        "tokenVerifyUrl": "https://auth.example.com/introspect",
        "clientId": "mcp-firebird",
        "clientSecret": "configure-securely",
        "scope": "database:read"
      },
      "rolePermissions": {
        "analyst": { "tables": ["SALES"], "operations": ["SELECT"] }
      }
    }
  }
}
```

HTTP requests use the Bearer token with an HTTPS introspection endpoint: form-encoded `token`, HTTP Basic client credentials, no redirects, five-second timeout. The endpoint must return `active:true`, a non-empty `sub`/`user_id`, and a `role` (or first `roles` entry). Required space-separated scopes and any provided expiry are checked. Your trusted authorization server must validate token audience and issuance policy. Missing identity, inactive/expired tokens, missing scopes and service failures deny access.

In OAuth mode the Bearer token is an OAuth token, not the static API key. Verified identity flows to role checks; global restrictions and role permissions both apply. HTTP/SSE sessions are bound to the originating security identity. STDIO cannot supply an HTTP identity and database requests are denied when such authorization is configured. Use a separate STDIO policy instead of disabling checks silently.

## CORS

Defaults remain wildcard origin `*`, Authorization header allowed, browser credentials disabled. STDIO and server-side clients do not depend on CORS. Restrict browser origins with:

```bash
export MCP_ALLOWED_ORIGIN="https://app.example.com,https://admin.example.com"
```

CORS is not authentication. Do not expose an unauthenticated HTTP service to the Internet.

## Auditing

```json
{
  "security": {
    "audit": {
      "enabled": true,
      "destination": "file",
      "auditFile": "./logs/security-audit.jsonl",
      "detailLevel": "medium",
      "logQueries": true,
      "logParameters": false,
      "logResponses": false
    }
  }
}
```

Destinations are `file`, `database`, `both`. File entries are newline-delimited JSON. Database auditing uses a validated `auditTable` name (default `MCP_AUDIT_LOG`), parameterized inserts and UUID keys. The server creates a missing table with Firebird 2.5-compatible types. The account needs the corresponding rights; this internal setup is explicitly authorized by enabling database auditing. Use a new table name if an older incompatible audit schema exists; initialization does not silently ignore setup failures.

An intent entry precedes execution and a completion/failure entry follows it. `basic` omits SQL/parameters/responses; `medium` can include query text; `full` additionally permits parameters/responses when their flags are enabled. Response auditing receives masked data. Audit logs can still contain sensitive SQL literals or parameters when enabled: protect permissions, rotation and retention externally.

An unavailable audit sink prevents query dispatch or withholds the result. A failure after a write has run does not roll it back; audit and user operations are not one atomic transaction. Denied requests are audited where possible. This is not a tamper-proof compliance log.

## Verification and boundaries

Run `npm test -- --runInBand` and `npm run build`. The opt-in `scripts/security-firebird-smoke.mjs` creates/drops a UUID-named disposable local database; see the review for execution details. Tests cover actual query dispatch, not only JSON schema acceptance.

These controls do not provide OS isolation, TLS termination, database CPU accounting, a complete SQL parser or automatic protection against every indirect database dependency. Keep Firebird grants minimal, protect configuration files and credentials, use HTTPS/firewalls, maintain backups and test alpha migrations before rollout.
