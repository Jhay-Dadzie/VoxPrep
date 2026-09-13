# ADR-0001: REST and the voice gateway share one process and one port

- **Status:** Accepted
- **Date:** 2026-08-28 *(recorded retrospectively; the code predates this record)*
- **Deciders:** VoxPrep maintainers

## Context

The live voice interview needs a WebSocket. The rest of the product needs a REST
API. Both are Node, both need the same Supabase session context, and both are
reached from the same mobile client.

The client is the constraint that decides this. In development it runs on a
phone connected to a laptop over Wi-Fi, and the laptop's LAN address changes
whenever DHCP hands out a new lease. Every network address the client has to
know about is an address that goes stale, and a stale one fails opaquely — an
axios `ERR_NETWORK`, or an interviewer that simply never speaks.

In production, every distinct listener is a firewall rule, a proxy block, and a
TLS certificate path to get right.

## Decision

The WebSocket gateway is attached to the same HTTP server as the REST API, on
the same port, at `/api/v1/interviews/agent`. The client derives the socket URL
from its REST base URL rather than being configured with a second one.

Attachment uses `ws`'s `noServer: true` mode with a manual `upgrade` handler
that checks the path, rather than `{ server, path }`.

## Options considered

### Option A — one process, one port *(chosen)*

One address for the client to resolve, one firewall rule, one tunnel, one
certificate. The socket URL is a string transformation of the REST URL:

```ts
`${API_BASE_URL.replace(/^http/, 'ws')}/interviews/agent`
```

which means the development-time host detection that follows the Expo dev server
applies to the socket for free.

### Option B — a separate WebSocket service on its own port

Cleaner separation, and the voice workload could be scaled independently of the
REST workload — which is a real benefit, because voice sessions are long-lived
and stateful while REST requests are not.

Rejected because it requires a second configured URL on the client. That URL
would go stale the first time the developer's laptop changed IP, and the failure
mode is silent: the app loads, the session prepares, and then the interviewer
never speaks. The cost is paid on every developer machine, every day; the
benefit is paid once, at a scale the project has not reached.

### Option C — `new WebSocketServer({ server, path })`

Simpler than the manual upgrade handler, but it installs a server-wide upgrade
listener that swallows upgrades for every other path. A second WebSocket path
added later would silently never connect.

## Consequences

### Positive

- One URL for the client to know, derived rather than configured.
- One firewall rule, one proxy block, one certificate.
- The voice gateway sees the same environment and the same Supabase clients as
  the REST modules, with no cross-service call.
- Adding a second WebSocket path later is safe — the path check makes room for
  it.

### Negative

- **The API cannot scale horizontally without sticky sessions.** An active voice
  session holds an in-memory `AgentSession` and an upstream socket, so a load
  balancer must pin a connection to an instance.
- **Serverless and scale-to-zero platforms are unsuitable**, because they
  terminate long-lived connections.
- Voice load and REST load cannot be scaled independently.
- The reverse proxy needs a path-specific configuration with a long read timeout
  — see [deployment](../deployment.md#reverse-proxy-and-websockets).

### Neutral

- Without `DEEPGRAM_API_KEY`, the process still starts and serves REST; upgrade
  requests are destroyed and a warning is logged.

## Implementation

- `backend/src/server.js` — `attachAgentGateway(server)`
- `backend/src/modules/agent/agent.gateway.js` — `noServer`, path check, upgrade
- `frontend/lib/api-client.ts` — `agentSocketUrl()`

## Revisiting

Reopen when voice concurrency justifies independent scaling — specifically, when
sticky sessions become a real operational constraint rather than a checklist
item. At that point the client should be given the socket URL by the API (in the
`prepare` response) rather than by configuration, so the second address is still
never something a human has to keep in sync.
