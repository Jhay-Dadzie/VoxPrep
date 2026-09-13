# Deployment

Taking VoxPrep to production: the API, the database, and the mobile app.

## Table of contents

- [What is deployed](#what-is-deployed)
- [Pre-flight checklist](#pre-flight-checklist)
- [Database](#database)
- [Deploying the API](#deploying-the-api)
- [Reverse proxy and WebSockets](#reverse-proxy-and-websockets)
- [Building and releasing the app](#building-and-releasing-the-app)
- [Verification](#verification)
- [Observability](#observability)
- [Rollback](#rollback)
- [Cost and rate considerations](#cost-and-rate-considerations)

## What is deployed

| Artefact | Where it runs |
| --- | --- |
| API + voice gateway | One Node.js process, one port. Any host that runs long-lived Node processes and supports WebSocket upgrades |
| Database, auth, storage | Supabase (managed) |
| Mobile app | App Store, Google Play, or internal distribution via EAS |
| Web build | Optional static export from Expo |

The API is **stateful in one respect**: an active voice session holds an
in-memory `AgentSession` and an upstream socket. Horizontal scaling therefore
requires sticky sessions at the load balancer, or one instance. Serverless and
scale-to-zero platforms are unsuitable for the voice path — they terminate
long-lived connections.

## Pre-flight checklist

- [ ] `NODE_ENV=production`. This is a **security control**: it disables the
      permissive local-CORS pattern and removes stack traces from responses.
- [ ] `CORS_ORIGIN` lists every real browser origin. Left unset, only requests
      without an `Origin` header are accepted.
- [ ] `FRONTEND_URL` points at the production app, so OAuth and email
      verification return somewhere real.
- [ ] `SUPABASE_SECRET_KEY` is set **server-side only**, never in an
      `EXPO_PUBLIC_*` variable or a client build.
- [ ] `GEMINI_API_KEY` and `DEEPGRAM_API_KEY` are set, or the corresponding
      features are knowingly disabled.
- [ ] Migrations applied — see below.
- [ ] TLS terminates in front of the API. Access tokens and voice audio must
      never cross the network in clear text.
- [ ] The reverse proxy allows WebSocket upgrades on
      `/api/v1/interviews/agent`.
- [ ] Proxy timeouts exceed `DEEPGRAM_AGENT_MAX_MS` (default 30 minutes) for
      that path.
- [ ] Supabase Auth redirect URLs include the production callback.
- [ ] `npm test --prefix backend` passes on the commit being deployed.
- [ ] `CHANGELOG.md` updated and the release tagged.

Every variable is documented in [configuration](configuration.md).

## Database

Supabase is managed; you apply schema changes, not servers.

**First deployment.** Run `backend/supabase_schema.sql` in the SQL editor
against the production project.

**Subsequent deployments.** Apply only the new dated files from
`backend/migrations/`, in filename order. Do **not** re-run
`supabase_schema.sql` — its `CREATE INDEX` and `CREATE POLICY` statements are
not idempotent.

Migrations are written to be safe to paste twice, so a partially applied
migration can be re-run.

**Order matters.** Apply migrations before deploying code that depends on them.
The schema is backwards-compatible with the previous release (new columns are
added with defaults), so migrate first, deploy second.

Verify row-level security is on after every schema change:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Every user-data table must report `rowsecurity = true`. See
[data model](data-model.md#row-level-security).

## Deploying the API

```bash
npm ci --prefix backend --omit=dev
NODE_ENV=production node backend/src/server.js
```

`npm run dev` uses nodemon and is for development only.

Run under a supervisor that restarts on exit — systemd, PM2, or the platform's
own process manager. The application handles `SIGTERM` and `SIGINT` with a
graceful shutdown: it stops accepting connections, waits for in-flight requests,
and force-exits after 10 seconds. Give your supervisor a stop timeout above
that.

Uncaught exceptions and unhandled rejections are logged and trigger the same
shutdown path, so the supervisor sees a clean exit and restarts.

### Container sketch

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .
ENV NODE_ENV=production
EXPOSE 5050
CMD ["node", "src/server.js"]
```

Pass secrets as environment variables at run time. Never bake them into an
image — image layers are readable by anyone who can pull the image.

### Health checks

| Purpose | Endpoint | Expect |
| --- | --- | --- |
| Liveness | `GET /health` | `200` with `{"success":true}` |
| Readiness | `GET /api/v1/auth/health` | `200` |

Neither requires authentication. `GET /health` does **not** carry the `/api/v1`
prefix.

## Reverse proxy and WebSockets

The voice gateway shares the HTTP server, so the proxy must forward upgrades on
`/api/v1/interviews/agent`.

nginx:

```nginx
location /api/v1/interviews/agent {
    proxy_pass http://127.0.0.1:5050;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Must exceed DEEPGRAM_AGENT_MAX_MS (default 30 minutes).
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location /api/v1/ {
    proxy_pass http://127.0.0.1:5050;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Document uploads have no application-level size ceiling.
    # This is where to impose one if you need it.
    client_max_body_size 50m;
}
```

Symptoms of getting this wrong: the socket connects and then closes silently,
or the interviewer stops speaking mid-session at a fixed interval — that is the
proxy's read timeout, not the application.

## Building and releasing the app

Build profiles live in `frontend/eas.json`.

| Profile | Distribution | `EXPO_PUBLIC_API_URL` |
| --- | --- | --- |
| `development` | Internal, dev client | From the local environment |
| `preview` | Internal APK | A LAN address — **for internal testing only** |
| `production` | Store | **Currently a placeholder** |

> **The `production` profile in `eas.json` still reads
> `https://REPLACE-WITH-DEPLOYED-BACKEND/api/v1`.** Set it to the real API URL
> before the first store build, or the released app will point at nothing. The
> `preview` profile hard-codes a LAN IP, which is correct for internal builds
> and wrong for anything distributed further.

```bash
cd frontend

eas build --profile development --platform android   # dev client, includes native modules
eas build --profile preview --platform android       # internal APK
eas build --profile production --platform all        # store builds
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

`appVersionSource: "remote"` means EAS owns the build number, and
`autoIncrement: true` bumps it on production builds. The user-facing version in
`app.json` is yours to set, and should follow the same
[SemVer](https://semver.org/spec/v2.0.0.html) release as the API.

Web export, if you want it:

```bash
npx expo export --platform web    # static output in dist/
```

### Store requirements

Both stores require a privacy disclosure. VoxPrep records audio, transcribes
speech, and processes uploaded CVs and documents. Declare:

- **Microphone** — live interview audio, streamed and not retained by the app.
- **Files and documents** — job descriptions, course material, CVs, held in
  memory server-side for the duration of a request.
- **Contact info** — email address, for authentication.
- **Third-party processors** — Supabase, Google (Gemini), Deepgram.

The permission strings in `app.json` are already written for this and are what
the OS shows the user.

## Verification

After deploying:

```bash
curl https://api.example.com/health
curl https://api.example.com/api/v1/auth/health

# CORS allowlist
curl -I -H 'Origin: https://app.example.com' https://api.example.com/api/v1/auth/health

# WebSocket upgrade (expect 101)
curl -i -N \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://api.example.com/api/v1/interviews/agent
```

Then run one real session end to end: sign up, prepare, hold a short interview,
generate feedback, read it in history. The voice path is the one that fails
quietly, so exercise it explicitly.

Confirm in the logs that you see
`Voice interview gateway listening on /api/v1/interviews/agent` and **not**
`DEEPGRAM_API_KEY is not set`.

## Observability

Logging is `morgan` for the HTTP line plus a winston-backed logger recording
method, URL, status, and duration on response finish. Ship stdout to your log
platform.

What to alert on:

| Signal | Why |
| --- | --- |
| `5xx` rate | The message is generic by design; the log holds the real error |
| Voice sessions closing with `4503` | Upstream provider unreachable |
| Sessions ending with reason `time_limit` | Interviews running to the ceiling |
| Exam preparation timeouts | Tune `GEMINI_EXAM_TIMEOUT_MS` / `GEMINI_EXAM_BUDGET_MS` |
| `429` rate on `/auth/*` | Credential stuffing, or a limiter set too tight |

**Never log access tokens, refresh tokens, or provider keys.** The reason the
voice gateway authenticates in a message rather than a query string is precisely
that query strings land in logs.

## Rollback

1. **Code** — redeploy the previous tag. The API is stateless apart from
   in-flight voice sessions, which will be dropped; clients reconnect.
2. **Database** — migrations are additive (new tables, new columns with
   defaults), so the previous release runs against the newer schema. Prefer
   rolling code back and leaving the schema in place over writing a down
   migration under pressure.
3. **App** — store releases cannot be un-shipped. Halt the staged rollout, then
   ship a fix-forward build. This is why the API must stay compatible with the
   previous app version: the tolerance for retired mode ids like `oral_exam`
   and ignored fields like `questionCount` exists for exactly this reason.

## Cost and rate considerations

Every practice session consumes paid third-party capacity.

| Operation | Cost driver |
| --- | --- |
| Exam preparation | One large generation per paper — the most expensive single request |
| Interview turn | One generation per question |
| Live voice | Per-minute streaming across listen, think, and speak |
| Feedback | One grading call per answer |
| CV tailoring | One generation per CV |

Controls already in place: `MAX_SESSION_QUESTIONS = 15`,
`DEEPGRAM_AGENT_IDLE_MS` (a phone left face-down does not bill for an hour),
`DEEPGRAM_AGENT_MAX_MS`, and `GEMINI_EXAM_BUDGET_MS`.

The auth rate limiters do **not** cover generation endpoints. If cost per user
matters to you, add limits at the proxy or introduce per-user quotas before
opening sign-ups.

Note that the interview is run by Gemini through Deepgram's `think` stage while
grading calls Google directly, so the two never contend for the same quota
inside one interview. Also note the constraint recorded in
`config/deepgram-agent.js`: Deepgram keeps its own allowlist of `think` models
that lags Google's catalogue, and an unlisted id is rejected when `Settings` is
applied — which surfaces as an interviewer that simply never speaks. Re-probe
before changing `DEEPGRAM_AGENT_THINK_MODEL`, and use the environment override
to try a new id without a deploy.
