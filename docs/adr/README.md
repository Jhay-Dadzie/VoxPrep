# Architecture Decision Records

An ADR captures **one decision**: what was decided, what forces drove it, and
what it costs. It is not a design document and not a tutorial — it is the answer
to "why is this like this?" written down while the answer is still known.

Format: [Michael Nygard's](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions),
lightly extended with a *Consequences* section split into positive and negative.

## Index

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-single-process-rest-and-websocket.md) | REST and the voice gateway share one process and one port | Accepted |
| [0002](0002-separate-tables-for-written-exams.md) | Written exams get their own tables, sharing only the session | Accepted |
| [0003](0003-authenticate-websocket-in-first-message.md) | The WebSocket authenticates in its first message, not the URL | Accepted |
| [0004](0004-per-turn-question-generation.md) | Interview questions are generated per turn, not up front | Accepted |
| [0005](0005-do-not-store-cv-source-text.md) | Extracted CV text is never persisted | Accepted |
| [0006](0006-indirect-voice-identifiers.md) | The client names voices by stable id; the server maps them to vendors | Accepted |
| [0007](0007-unreported-scores-are-null-not-zero.md) | Unreported grading metrics are null and excluded from averages | Accepted |

## Statuses

| Status | Meaning |
| --- | --- |
| **Proposed** | Under discussion. May change. |
| **Accepted** | In force. The code reflects it. |
| **Deprecated** | No longer recommended, but still present in the code. |
| **Superseded by ADR-NNNN** | Replaced. The record stays; history is not rewritten. |

## Writing one

Copy [`0000-template.md`](0000-template.md), number it next in sequence, and
name the file `NNNN-kebab-case-title.md`. The title is a **statement**, not a
topic: "Written exams get their own tables", not "Exam table design".

Write an ADR when a decision:

- constrains future work (a technology choice, a protocol rule, a schema shape
  that is hard to reverse);
- has a non-obvious rationale that a reader would otherwise try to "fix";
- was contested, and the losing option deserves recording so it is not re-argued.

Do **not** write one for a routine implementation choice with an obvious default.

## Rules

- **ADRs are immutable once accepted.** To change a decision, write a new ADR
  and mark the old one *Superseded by ADR-NNNN*. Editing history to look
  consistent destroys the value of having it.
- **Record the option you rejected**, and why. The rejected option is the part a
  future reader most needs.
- **State the cost.** An ADR with no negative consequences is advertising, not a
  record.
- Link ADRs to the code they govern by file path, so a reader can check whether
  the decision still holds.
