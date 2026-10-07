# MCP Firebird 2.12.0: MCP 2026-07-28 migration

Stable 2.12.0 promotes all five 2.12.0 alphas and explicitly opts into MCP 2026-07-28 using SDK v2 `createMcpHandler` (HTTP) and `serveStdio` (stdio). Upgrading an SDK dependency alone does not opt in. A single server factory defines the tools, prompts, and resources for every executable entry point. See the [complete release notes](releases/2.12.0.md) for timeout, connection, schema and SQL fixes.

## Compatibility

- Node.js **20.19+**, including supported Node 22 and 24 releases. Older runtimes must stay on stable 2.11.0 until Node is upgraded; SDK v2 introduces this minimum.
- MCP 2026-07-28 clients: `server/discover`, per-request HTTP execution, SDK envelope/header validation, and `subscriptions/listen`
- 2025 clients: the normal `initialize` handshake; sessionful HTTP remains the default for this era
- `STREAMABLE_STATELESS_MODE=true` changes only the 2025 HTTP branch; 2026 HTTP is already per-request
- Legacy HTTP+SSE clients still use `/sse` and `/messages`
- `/mcp` automatically selects the protocol era; there is no separate `/mcp-auto` route
- `dist/cli.js`, `dist/index.js`, `dist/http-entry.js`, and compatibility server modules use the shared implementation
- `USE_LEGACY_SERVER` no longer selects a divergent implementation; it is obsolete

Tools now publish `outputSchema`, `structuredContent`, and truthful annotations. Existing JSON text remains available. Failures, including partial batch failures, use `isError: true`. See [tool contract](tool-contract.md). SQL authorization remains opt-in; this migration does not change the administrator's SQL policy.

For upgrades from an earlier 2.12 alpha, use **stable 2.12.0**: it includes
the #39 table-list output schema regression and the empty-value-schema warnings.
Table names remain strings in both legacy text and structured results; no policy
or client payload change is required. See [schema compatibility details](tool-contract.md#alpha4-schema-compatibility-correction-39).

## HTTP compatibility and opt-in hardening

`MCP_HTTP_SECURITY_MODE=compat` is the default. It preserves the old `0.0.0.0` bind, wildcard non-cookie CORS (unset, empty or `MCP_ALLOWED_ORIGIN=*`), and OAuth introspection-only configurations. HTTP startup emits a warning. This migration bridge does **not** provide the Host/browser-origin isolation of strict mode. Use authentication, a trusted network/firewall and least-privilege database credentials; never expose an unauthenticated MCP publicly.

Set `MCP_HTTP_SECURITY_MODE=strict` for the defenses below. Unknown modes fail startup. Explicit Host/Origin lists are enforced in either mode. `MCP_ALLOW_REMOTE=false` denies a non-loopback bind in either mode. Remove the mode variable or set it to `compat` to disable strict defaults; explicitly configured policies remain enforced until removed and the process restarted. This switch never disables SQL authorization or authentication.

`--host` remains the **Firebird database host**. Set `HTTP_HOST` for the MCP listener.

Local example:

```sh
MCP_HTTP_SECURITY_MODE=strict TRANSPORT_TYPE=http HTTP_PORT=3003 node dist/cli.js
```

Remote example (use TLS at a trusted reverse proxy):

```sh
MCP_HTTP_SECURITY_MODE=strict TRANSPORT_TYPE=http HTTP_HOST=0.0.0.0 MCP_ALLOW_REMOTE=true \
MCP_ALLOWED_HOSTS=mcp.example.com \
MCP_ALLOWED_ORIGIN=https://app.example.com \
node dist/cli.js
```

The administrator must additionally configure Bearer authentication or OAuth before exposing database access. Do not put real keys in shell history. In strict mode, origin access defaults to same-origin and wildcard origins are rejected. Host allowlists never accept wildcards. Forwarded host/protocol headers do not confer trust; configure the public HTTPS origin explicitly behind a TLS proxy.

Strict-mode containers must opt into a non-loopback bind explicitly; a loopback listener inside a container is not reachable through port publishing. The Compose development example opts into strict mode and publishes the host port on loopback only. Existing compatibility-mode containers retain the previous bind behavior. For remote deployment configure public hostnames, origins, TLS and authentication deliberately.

## OAuth setup change

Existing OAuth configurations omitting both new fields retain their old introspection checks in compatibility mode, with a warning. They do not perform local audience validation or publish discovery: use a trusted, resource-specific introspection provider. To enable discovery and audience binding, configure `resourceUrl` (the canonical MCP endpoint) and `authorizationServers` (trusted issuer URLs) **together**. Partial/invalid settings fail validation. The introspected `aud` must then contain `resourceUrl` exactly in **either HTTP mode**, without fallback. Strict HTTP rejects OAuth configurations missing these fields before listening. See [security configuration](security.md).

No OAuth authorization server, dynamic client registration service, or token issuance service is bundled. Use a provider that supports the necessary client flow and introspection. Stdio does not require HTTP/OAuth configuration.

## Verification

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm run build
npm test -- --runInBand
npm run test:protocol
```

The protocol tests launch real stdio subprocesses and loopback HTTP/SSE listeners. They exercise 2025 and 2026 clients, SDK 1.29 compatibility, catalog/schema validation, and protocol-level tool errors without a Firebird installation. Unit tests mock database interactions and do not prove real driver behavior.

Live Firebird SQL/event validation is manual. The opt-in `scripts/security-firebird-smoke.mjs` creates a disposable local database and has passed on Firebird 2.5.9, including SQL policies and real pure-JS `POST_EVENT` delivery, independent subscribers, disconnect cleanup and reconnect. Automated native-driver event tests still use mocks; validate native event delivery in your deployment before production use. No driver dependency was replaced. GitHub Actions remains disabled; no workflow is added. Run checks locally.

Official migration references:
- https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.html
- https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html
