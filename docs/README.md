# VoxPrep Documentation

This directory is the authoritative documentation for VoxPrep. It is organised
along the [Diátaxis](https://diataxis.fr/) framework, which separates
documentation by the reader's situation rather than by subject matter.

| If you want to… | Read |
| --- | --- |
| Get the system running for the first time | [Getting started](getting-started.md) |
| Understand how the pieces fit together | [Architecture](architecture.md) |
| Call the REST API | [API reference](api/README.md) · [OpenAPI spec](api/openapi.yaml) |
| Implement or debug a live voice session | [Voice agent protocol](voice-agent-protocol.md) |
| Query or change the database | [Data model](data-model.md) |
| Configure an environment | [Configuration](configuration.md) |
| Work on the mobile client | [Frontend guide](frontend.md) |
| Run or write tests | [Testing](testing.md) |
| Ship to production | [Deployment](deployment.md) |
| Know why something is the way it is | [Decision records](adr/) |
| Look up a term | [Glossary](glossary.md) |
| Read the academic project report | [Project report](thesis/README.md) |

## Documentation map

```
docs/
├── README.md                   ← you are here
├── getting-started.md          Tutorial: zero to a completed interview
├── architecture.md             Explanation: context, containers, modules, flows
├── configuration.md            Reference: every environment variable
├── data-model.md               Reference: tables, RLS, triggers, views, migrations
├── frontend.md                 Reference: screens, state, services, native needs
├── voice-agent-protocol.md     Reference: WebSocket handshake, frames, close codes
├── testing.md                  How-to: run, write, and structure tests
├── deployment.md               How-to: production checklist and release
├── glossary.md                 Reference: domain vocabulary
├── api/
│   ├── README.md               Reference: conventions, auth, errors, pagination
│   └── openapi.yaml            Reference: OpenAPI 3.1 machine-readable contract
├── adr/
│   ├── README.md               Index and process
│   ├── 0000-template.md        Template for new records
│   └── 0001…0007-*.md          Accepted decisions
└── thesis/
    ├── README.md               Contents and pre-submission checklist
    ├── 00-front-matter.md      Title, declaration, abstract, contents, lists
    ├── 01…06-*.md              Chapters One to Six
    ├── references.md           Cited works
    └── appendices.md           Inventory, API, ADRs, instruments, schema, deployment
```

`thesis/` is the academic project report: an extended *explanation* document in
Diátaxis terms, written to standard thesis convention. It justifies the system
where the rest of `docs/` describes it, and cites the ADRs as the primary record
of each design position.

## Standards this documentation follows

| Concern | Standard |
| --- | --- |
| Root readme structure | [Standard Readme](https://github.com/RichardLitt/standard-readme) |
| API description | [OpenAPI Specification 3.1.0](https://spec.openapis.org/oas/v3.1.0) |
| Change history | [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) |
| Versioning | [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) |
| Commit messages | [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) |
| Community conduct | [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html) |
| Decision records | [Nygard-style ADRs](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) |
| Requirement keywords | [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) |
| HTTP semantics and status codes | [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) |
| Dates and timestamps | [ISO 8601](https://www.iso.org/iso-8601-date-and-time-format.html) |
| Documentation organisation | [Diátaxis](https://diataxis.fr/) |

## Keeping this current

Documentation is updated in the same pull request as the change it describes.
[`CONTRIBUTING.md`](../CONTRIBUTING.md#documentation-standards) lists which
document each kind of change obliges you to touch. In short:

| You changed… | Update |
| --- | --- |
| A request or response shape | `api/openapi.yaml` |
| The database | `data-model.md` **and** add a dated migration |
| An environment variable | `configuration.md` |
| A WebSocket frame or close code | `voice-agent-protocol.md` |
| A screen or navigation route | `frontend.md` |
| Anything constraining future work | A new record in `adr/` |

## Legacy notes

Several older working documents remain in `frontend/`:
`BACKEND_INTEGRATION.md`, `INTEGRATION_CHECKLIST.md`,
`LOGIN_AND_PASSWORD_FIXES.md`, `MOBILE_TESTING.md`,
`NETWORK_ERROR_TROUBLESHOOTING.md`, `PROFILE_AND_SETTINGS.md`, and
`SIGNUP_TROUBLESHOOTING.md`.

They predate this documentation set and overlap with it. Where they disagree
with `docs/`, **`docs/` is authoritative** — it is generated from and verified
against the current code. The legacy files are retained because their
troubleshooting sections cover real, recurring setup failures (LAN addressing,
Expo networking, signup edge cases) in more depth than the setup guide here
does.
