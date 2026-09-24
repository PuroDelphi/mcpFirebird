# Security in MCP Firebird

[Español](security.es.md)

This guide describes enforcement in **2.11.0-alpha.2**, not older npm releases. See the [security implementation review](security-implementation-review.md) and [changelog](../CHANGELOG.md).

## Important migration notice

Earlier documentation incorrectly presented `sql` settings and several disconnected security helpers as enforced protections. This alpha connects the policy to query execution and rejects unsupported or ambiguous requests. Existing workloads may need configuration changes:

- Invalid selected configuration files now stop initialization instead of falling back to defaults.
- `ALLOW_RAW_SQL=true` no longer bypasses operation restrictions. DDL needs another explicit opt-in.
- User queries against system tables are denied by default. Fixed server-authored metadata queries remain available, subject to operation/object permissions.
- Row, response, query-count, rate and deadline limits are now enforced. Metadata queries also consume quotas.
- Policies restricting tables, rows, masking or roles use a conservative single-table SQL subset. Unsupported joins, CTEs, nested queries and opaque routines are rejected under these policies.
- Shared event subscriptions are unavailable with scoped policies because the legacy event manager is not isolated per user.

Do not deploy an alpha directly into production without testing representative queries. **Use a least-privilege Firebird account, not SYSDBA.** Application checks complement, but do not replace, database privileges. A permitted view may expose underlying objects; configure database views and grants accordingly.

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
| `sql.allowSystemTables` | `false` | Deny user access to `RDB$`, `MON$` and `SEC$` relations unless explicitly listed below. `true` permits reads of these relations; other restrictions still apply. |
| `sql.allowedSystemTables` | `[]` | Exact relation names allowed as read-only exceptions while broad access is disabled. |
| `sql.allowDDL` | `false` | Additional gate for `CREATE`, `ALTER`, `DROP`, `RECREATE`, `GRANT`, `REVOKE`, `COMMENT`. Requires the write gate and operation permissions too. |
| `sql.allowUnsafeQueries` | `false` | Opt-in for `UNION` and opaque routine calls in unrestricted trusted deployments. Never bypasses table/row/masking/role rules, system-table restrictions or DDL gates. |

Direct system-relation writes, multiple statements, dynamic SQL and procedural blocks are always rejected. Internal metadata reads are fixed/parameterized server SQL, not an exemption that a tool caller can request. With `allowedTables`, include any explicitly queried catalog relation there as well: permissions are cumulative.

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

Also set `ALLOW_RAW_SQL=true`. To permit an operation forbidden by default, explicitly adjust `forbiddenOperations`; denials always win. SQL writes otherwise remain disabled.

Opaque function calls and `EXECUTE PROCEDURE` additionally require `allowUnsafeQueries=true`, `ALLOW_RAW_SQL=true` and `EXECUTE` permission, with no scoped table/row/masking/role policy. Their bodies cannot be inspected by this policy and may have side effects. Never enable this for an untrusted database account. Unknown SQL syntax is rejected rather than assumed safe; this is not a complete Firebird SQL parser or an injection-proof sandbox. Use parameterized values.

## Table and operation permissions

`allowedTables`, `forbiddenTables` and `tableNamePattern` apply at the query boundary, to table metadata access, and to listing visibility. Names are exact database identifiers: normal unquoted SQL identifiers resolve to uppercase; quoted names retain case. Table metadata tools that normalize input to uppercase check that normalized name. Routine metadata uses object names for these restrictions; trigger metadata uses its parent table.

`allowedOperations` defaults to `SELECT, EXECUTE`; `forbiddenOperations` defaults to `DROP, TRUNCATE, ALTER, GRANT, REVOKE`. Both lists use uppercase names. Global denials apply even with `ALLOW_RAW_SQL=true` or a permissive role. Routine metadata tools retain their `EXECUTE` gate and also require `SELECT` for the internal catalog read.

Scoped policies accept single-table statements only. Joins, CTEs, nested SELECTs, selectable procedures and DDL are rejected in this mode. Use a database-enforced view for complex reporting; the view itself must implement the required row/column restrictions. Views, triggers and routines can have indirect dependencies that text checks cannot authorize for you.

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

These are the defaults. Both row limits apply; the lower wins. Oversized results are rejected, not silently truncated. Size is measured using UTF-8 JSON bytes; tool/resource wrappers also check aggregate responses. Row/size checks occur after driver materialization, so they are **not a database memory quota**. Use `FIRST`/`ROWS` and database-side controls to bound work.

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
