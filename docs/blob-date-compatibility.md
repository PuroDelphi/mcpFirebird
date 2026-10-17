# BLOB, date and prompt compatibility (stable 2.12.2)

The transaction/BLOB fixes from PR #43 are retained. Stable **2.12.2 restores the pre-2.12.1 date output by default** and makes 2.12.1's wall-clock representation explicitly optional. Install with `npm install -g mcp-firebird@latest` or select `mcp-firebird@2.12.2` in your existing `npx` launcher, then restart the MCP process. Retain your connection and security settings. See the [stable release notes](releases/2.12.2.md).

## Pure-JavaScript database transactions

Queries using `node-firebird` run **once** inside an explicit transaction. BLOB columns, including `LIST()` results and columns whose first row is NULL, are read using that same transaction before commit. SQL is never replayed after inspecting its results.

The transaction keeps the driver's existing repeatable-read, read/write isolation. Existing SQL authorization, `ALLOW_RAW_SQL` and internal audit writes remain in effect. The proposed `FIREBIRD_READ_ONLY` setting is not introduced. The native adapter retains its existing transaction and BLOB handling.

Commit failures reject the query. Rollback/commit callbacks and returned adapter promises must finish before the attachment can be released or discarded; a fixed timer never declares transaction cleanup successful. Existing configured query deadlines still reject the request promptly, but pending database work continues to occupy its pool slot until it settles. No implicit deadline is added. A callback that never arrives can therefore retain a slot indefinitely; a configured deadline is not server-side cancellation. Do not automatically retry timed-out writes, which may still commit.

## Date representation

`FIREBIRD_DATE_FORMAT` is an optional **MCP process environment variable**, not a SQL/security policy field or an HTTP query parameter. It applies only to pure-JavaScript database row columns returned as JavaScript `Date` values. The native adapter, generic tool timestamps, binary serialization, database contents, transaction mode and SQL permissions are unchanged.

| Setting | Output |
| --- | --- |
| Unset, empty/whitespace, or `iso` | Preserve Date objects internally; normal JSON serialization emits ISO 8601 UTC strings with `T` and `Z`, exactly as before 2.12.1. No new client setting is required. |
| `wall-clock` | Opt in to `YYYY-MM-DD HH:mm:ss.SSS`, using the driver's local date/time fields without a zone suffix. This retains the date representation from 2.12.1 and the two 2.12.1 alphas. |

Values are case-sensitive after trimming whitespace. Any other value rejects a pure-JS query before its application SQL/transaction is started; the setting is not a startup/authentication control. Each query snapshots its mode before dispatch. Configure the owning launcher and restart the MCP process rather than changing it during requests.

For example, with the MCP process in `America/Bogota`, a driver Date representing local `2026-09-04 23:12:26.985` is serialized as `2026-09-05T04:12:26.985Z` by default, or `2026-09-04 23:12:26.985` with `wall-clock`. ISO conversion can change the displayed calendar day; it is preserved for backward compatibility, not a claim that a zone-free Firebird timestamp is inherently a UTC instant. Actual interpretation still depends on the driver and the process timezone.

**Upgrading from 2.12.0 or earlier:** leave the variable unset; no date-parser migration is required for this fix. **Upgrading from 2.12.1:** if you adapted your client to the wall-clock representation, explicitly select `wall-clock` to keep it. Otherwise the historical ISO output is restored.

### Opt in to wall-clock output

In the existing MCP launcher's environment, merge this setting without replacing connection/authentication variables:

```json
{
  "env": {
    "FIREBIRD_DATE_FORMAT": "wall-clock"
  }
}
```

Alternatively, set `FIREBIRD_DATE_FORMAT=wall-clock` in the MCP process's `.env` file or deployment environment. The supplied Compose example forwards `${FIREBIRD_DATE_FORMAT:-iso}`; set the variable in Compose's `.env`/launch environment and recreate the MCP container. Do not restart or modify the database server just to change this output setting. To restore the default, remove the variable or set `iso`, then restart/recreate the MCP process/container.

Both modes retain the driver's JavaScript millisecond precision, not Firebird's full fractional precision. DATE values include a midnight component; TIME values retain the driver's synthetic date component (typically 1970-01-01). This is not support for timezone-aware Firebird types or a fix for every driver date limitation. Existing text-BLOB decoding is preserved; no new binary-to-UTF-8 conversion is introduced.

### Español

En **2.12.2**, sin configurar nada, se recupera la salida anterior a 2.12.1: fechas ISO con `T` y `Z`. `FIREBIRD_DATE_FORMAT=iso` la selecciona expresamente; vacío también significa `iso`. Solo `FIREBIRD_DATE_FORMAT=wall-clock` activa `YYYY-MM-DD HH:mm:ss.SSS` sin zona horaria. Añade esa variable al `env` del lanzador MCP sin reemplazar la conexión/autenticación y reinicia el proceso; en Docker, recrea el contenedor MCP con esa variable. Para volver al formato anterior elimina la variable o usa `iso`. No se modifican los datos ni el servidor Firebird; el driver nativo no cambia. Si adaptaste tu cliente al formato de 2.12.1, selecciona `wall-clock` para conservarlo.

## Statistics and prompts

`analyze-table-statistics` uses `TOTAL_ROWS` for its SQL count alias; the response field remains `rowCount`.

The health-check and security-audit prompts accept either one string or an array of recognized values. Invalid members are dropped; empty/unrecognized input (including `$1`) uses the documented default. Missing query-optimization and migration-planning arguments now default to `general` and `schema-change` respectively. This normalization only generates prompt text; it does not grant SQL permissions or execute a migration.

## Validation scope

Regression tests exercise real query-policy/transaction orchestration with controlled driver callbacks, commit/rollback failures and delays, BLOB deadlines, write/audit compatibility, prompt retrieval over MCP, nonzero statistics and wire-decoded dates in UTC, Istanbul, Bogota and New York. These automated tests do not claim live native-driver or WIN1254 database coverage. The opt-in `scripts/security-firebird-smoke.mjs` additionally exercises real BLOB/NULL/LIST results, dates and statistics when a disposable local Firebird service is available.

The expanded live smoke passed against local Firebird 2.5.9 on October 13, 2026, using the pure-JavaScript driver and a new disposable database. It covered BLOB/NULL/LIST, wall-clock timestamps, table statistics, authorized writes, audit and events. This does not establish native-driver or WIN1254 coverage.
