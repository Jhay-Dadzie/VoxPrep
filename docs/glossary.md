# Glossary

Domain vocabulary as this codebase uses it. Where a term has a specific meaning
here that differs from common usage, the difference is stated.

---

**Agent** — The live voice interviewer, run through Deepgram's Voice Agent API,
which bundles transcription, reasoning, and speech behind one duplex WebSocket.
Implemented in `backend/src/modules/agent/`. Distinct from an "AI agent" in the
tool-calling sense.

**Answer** — Ambiguous on its own; the codebase avoids it. A spoken answer is a
**response** (`user_responses`); a written selection is an **exam answer**
(`exam_answers`).

**Assessment** — The AI's evaluation of one spoken response, before it is
normalised into a `feedback` row. Built by `session.assessor` and parsed by
`feedback.parser`.

**Bench** — The built-in roster of named panelists used when a client sends no
roster of its own. Defined in `backend/src/modules/interviews/panel.js`. Exists
so older builds still get real names rather than "Interviewer 2".

**Chair** — Seat index 0 on a panel. Opens the interview, delivers the closing
remark, and is the default voice for clients that send only one.

**Closing** — The wind-down phase of a voice session. The server emits
`closing`, the chair speaks a closing remark, then `done` is emitted and the
socket closes.

**Duplex** — Audio flowing in both directions at once over one connection. The
voice interview is duplex on the wire; whether the *client* can use it in both
directions simultaneously depends on platform echo cancellation — see
**half-duplex**.

**Envelope** — The uniform response wrapper: `{ status, message, data }` on
success, `{ status, message }` on failure. The `/health` probes are the
documented exception.

**Exam** — A written multiple-choice paper: 30 questions, 4 options each, marked
arithmetically out of 100. A practice mode (`exam`) and a `session_kind`. Not a
spoken session.

**Format** — Whether a mode is `voice` (a spoken conversation) or `written` (a
marked paper). Client and server both branch on this rather than on the mode id,
so a second written mode costs nothing.

**Half-duplex** — Running the microphone only while the interviewer is silent.
Android does this because it exposes no equivalent of iOS voice processing, and
an open microphone in front of a loudspeaker makes the interviewer transcribe
its own voice as the candidate's answer.

**Handover** — Passing the floor from one panelist to the next. Emits a
`speaker` event to the client and an `UpdateSpeak` message upstream so the next
utterance is synthesised in that panelist's voice.

**History** — Reviewable sessions: those with status `completed` or `paused`.
Active-session lifecycle lives under `/interviews`, not `/history`.

**Idle timeout** — How long a voice session may go without candidate audio
before it closes (`DEEPGRAM_AGENT_IDLE_MS`, default 120 s). Long enough to
survive someone thinking hard, short enough that a phone left face-down does not
bill for an hour.

**Job description** — The stored source material for a session, whatever it
actually is. The table is `job_descriptions` even when it holds a thesis
abstract or a set of lecture notes; each mode gives it a user-facing
`sourceLabel`.

**Mapper** — The module that converts database rows into wire shapes. Nothing
reaches a client except through one. This is what keeps marking schemes out of a
paper being sat.

**Marking** — Scoring a written paper. Arithmetic, not model-driven. `is_correct`
is written at marking time so the result keeps reporting the paper it was marked
against.

**Mode** — What kind of practice this is: `job_interview`, `exam`,
`viva_defense`, or `visa_interview`. The **server half** (persona, question mix,
rules) lives in `modules/interviews/modes.js` and never leaves the server; the
**display half** (labels, vocabulary) lives in `frontend/constants/modes.ts`.
Mode is not persisted on a session — it is supplied per request and shapes the
prompt only.

**Mode alias** — A retired mode id still arriving from installed clients.
`oral_exam` → `exam`. Accepted rather than rejected, because rejecting it would
break setup for anyone who has not updated.

**Panel** — The people the candidate faces: up to four seats, chair first, each
with a distinct voice. Roles fill in order: Chair, Technical, Domain Expert,
External.

**Prepare** — The one-shot setup call that turns source material into a session.
`POST /interviews/prepare` returns a session and **no questions**;
`POST /exams/prepare` really does generate the paper and is the slowest request
in the app.

**Question type** — `behavioral`, `technical`, `situational`, or `general`. Each
mode specifies a rough proportion (`typeMix`).

**Response** — A candidate's spoken answer, after transcription
(`user_responses`). Not an HTTP response, which the codebase writes as `res`.

**Retake** — A new session on the same source material. Available for both
interviews and exams; the original session and its feedback are preserved.

**RLS (row-level security)** — PostgreSQL policies restricting rows to their
owner. Defence in depth here, not the primary authorization control: the API
uses the service-role client for most reads and enforces ownership with explicit
`user_id` filters in the service layer.

**Roster** — The panel as the client sends it: names, seats, and voice ids.
Seated by `resolvePanel`, which guarantees voice distinctness.

**Score** — An integer 0–100 across five dimensions: relevance, completeness,
technical accuracy, clarity, and confidence. **Null is not zero** — a null score
means the grader did not report that dimension, and it is excluded from the
average.

**Seat** — One position on a panel: a voice id, a name, a role, and a resolved
TTS model. Every seat's model is distinct.

**Service-role key** — `SUPABASE_SECRET_KEY`. Bypasses every RLS policy.
Server-side only, never in a client build or a log.

**Session** — One practice attempt. A row in `interview_sessions`, spoken or
written, distinguished by `session_kind`.

**Session kind** — `interview` or `exam`. The one bit history, statistics, and
the dashboard need in order to send the user to the right review screen.

**Sitting question** — An exam question as the student sees it: options, no
correct answer, no explanation. `mapSittingQuestion` has no field for them.
Contrast **marked question**.

**Source material** — Whatever the user supplies to practise against: a job
posting, thesis abstract, visa application details, or course notes. Must yield
at least 50 characters of readable text.

**Speaker** — The panelist currently holding the floor. The `speaker` event
tells the client whose voice is about to speak.

**Tailored CV** — An uploaded CV rewritten against a session's job description,
with the changes explained, keywords now evidenced, and remaining gaps stated
honestly. The extracted source text is never stored.

**Think model** — The LLM behind the voice agent's reasoning stage. Constrained
by Deepgram's own allowlist, which lags Google's catalogue; an unlisted id is
rejected when `Settings` is applied and surfaces as an interviewer that never
speaks.

**Turn** — One exchange in a spoken interview. `POST /interviews/:id/turn`
returns the next question, or `done`.

**Voice id** — A stable VoxPrep identifier for a voice (`f_warm_01`,
`m_measured_01`), mapped server-side to a vendor TTS voice. The indirection lets
the vendor change without an app release.

**Written mode** — A mode whose `format` is `written`. Has no voice, no panel,
and no per-answer AI feedback. Currently only `exam`.
