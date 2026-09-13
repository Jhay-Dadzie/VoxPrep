# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## How to use this file

Every user-visible change adds a bullet under `Unreleased`, in the appropriate
category, written from the perspective of someone using the software rather than
someone who wrote it. Categories, in the order they appear in a release:

| Category | Use for |
| --- | --- |
| `Added` | New features |
| `Changed` | Changes in existing functionality |
| `Deprecated` | Features that will be removed in an upcoming release |
| `Removed` | Features removed in this release |
| `Fixed` | Bug fixes |
| `Security` | Vulnerability fixes — always call these out |

When a release is cut, rename `Unreleased` to the version and date
(`## [1.1.0] - 2026-09-04`), open a fresh `Unreleased` section above it, and add
the comparison links at the bottom.

Version numbers follow SemVer against the **public API and client contract**:

- **MAJOR** — a breaking change to the REST contract, the WebSocket protocol,
  or the database schema that requires client or operator action.
- **MINOR** — new endpoints, new modes, new optional fields, added
  backwards-compatible behaviour.
- **PATCH** — bug fixes and internal changes with no contract impact.

---

## [Unreleased]

Changes on `main` that have not yet been released.

### Added

- Standardised project documentation set: `README.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, this changelog, and the `docs/` tree
  covering architecture, API (OpenAPI 3.1), data model, configuration, the
  voice protocol, the client, testing, deployment, a glossary, and Architecture
  Decision Records.

### Changed

_Nothing yet._

### Fixed

_Nothing yet._

### Security

_Nothing yet._

---

## Prior history

This changelog was introduced after development was already underway, so
releases before it are not itemised here. The commit history is the record for
that period; it follows
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), so a
categorised view of any range is available with:

```bash
git log --oneline --grep '^feat' <from>..<to>   # Added
git log --oneline --grep '^fix'  <from>..<to>   # Fixed
```

Major capabilities delivered during that period, for orientation rather than as
a release record: Supabase-backed authentication, job-description ingestion from
pasted text and uploaded documents, per-turn interview generation, the live
voice gateway with a multi-voice panel, written exam papers with arithmetic
marking, AI feedback and scoring, session history and statistics, and CV
tailoring.

<!--
Link definitions. Add one per release when tagging, e.g.:

[Unreleased]: https://github.com/<owner>/<repo>/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/<owner>/<repo>/releases/tag/v1.0.0
-->
