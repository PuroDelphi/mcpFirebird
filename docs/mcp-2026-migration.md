# Alpha: MCP 2026-07-28 migration

This branch explicitly opts into MCP 2026-07-28 using SDK v2 `createMcpHandler` (HTTP) and `serveStdio` (stdio). Upgrading an SDK dependency alone does not opt in. A single server factory defines the tools, prompts, and resources for every executable entry point.

## Compatibility

- Node.js **20.19+**, including supported Node 22 and 24 releases
- MCP 2026-07-28 clients: `server/discover`, per-request HTTP execution, SDK envelope/header validation, and `subscriptions/listen`
- 2025 clients: the normal `initialize` handshake; sessionful HTTP remains the default for this era
- `STREAMABLE_STATELESS_MODE=true` changes only the 2025 HTTP branch; 2026 HTTP is already per-request
- Legacy HTTP+SSE clients still use `/sse` and `/messages`
- `/mcp` automatically selects the protocol era; there is no separate `/mcp-auto` route
- `dist/cli.js`, `dist/index.js`, `dist/http-entry.js`, and compatibility server modules use the shared implementation
- `USE_LEGACY_SERVER` no longer selects a divergent implementation; it is obsolete

Tools now publish `outputSchema`, `structuredContent`, and truthful annotations. Existing JSON text remains available. Failures, including partial batch failures, use `isError: true`. See [tool contract](tool-contract.md). SQL authorization remains opt-in; this migration does not change the administrator's SQL policy.

## HTTP exposure is deliberate

`--host` remains the **Firebird database host**. Set `HTTP_HOST` for the MCP listener.

Local example:

```sh
TRANSPORT_TYPE=http HTTP_HOST=127.0.0.1 HTTP_PORT=3003 node dist/cli.js
```

Remote example (use TLS at a trusted reverse proxy):

```sh
TRANSPORT_TYPE=http HTTP_HOST=0.0.0.0 MCP_ALLOW_REMOTE=true \
MCP_ALLOWED_HOSTS=mcp.example.com \
MCP_ALLOWED_ORIGIN=https://app.example.com \
node dist/cli.js
```

The administrator must additionally configure Bearer authentication or OAuth before exposing database access. Do not put real keys in shell history. Origin access is same-origin by default; CORS and Host/Origin validation are independent. Wildcard origin/host allowlists are rejected. Forwarded host/protocol headers do not confer trust; configure the public HTTPS origin explicitly behind a TLS proxy.

Containers must opt into a non-loopback bind explicitly; a loopback listener inside a container is not reachable through port publishing. The Compose development example makes this choice and publishes the host port on loopback only. For remote deployment configure the public hostname, origins, TLS and authentication deliberately.

## OAuth setup change

Introspection configuration now requires `resourceUrl` (the canonical MCP endpoint) and `authorizationServers` (trusted issuer URLs). The introspected `aud` must contain `resourceUrl` exactly. Invalid/missing audience tokens are rejected. Public protected-resource metadata and `WWW-Authenticate` challenges enable client discovery; see [security configuration](security.md).

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

Live Firebird SQL/event validation is intentionally manual for this PR. The existing opt-in `scripts/security-firebird-smoke.mjs` remains available for a disposable local database. The automated checks use mocked database drivers and do not establish real Firebird behavior; validate both SQL and event delivery in the intended deployment before release.

Official migration references:
- https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.html
- https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html
