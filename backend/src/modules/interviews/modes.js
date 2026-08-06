/**
 * Practice modes.
 *
 * VoxPrep runs one pipeline — speak a question, record the answer, transcribe,
 * score, store. What changes between a job interview, an oral exam and a viva
 * is only three things: the source material the user supplies, the prompt that
 * turns it into questions, and what "a good answer" means.
 *
 * Those three live here. Adding a fourth mode should mean adding an entry to
 * this file and nothing else.
 *
 * Note on scoring: the feedback table has four fixed score columns
 * (relevance, clarity, confidence, completeness). Modes do not add columns —
 * they reinterpret those four. "Completeness" means STAR coverage in a job
 * interview and concept coverage in an exam, but it is the same column.
 */

export const MODE_IDS = ['job_interview', 'oral_exam', 'viva_defense']

/**
 * Shared by every mode's follow-up prompt.
 *
 * The decision to ask nothing matters as much as the question itself: a
 * follow-up on an already-complete answer is padding, and a real interviewer
 * would move on. Returning null is the common case, not a failure.
 */
const FOLLOW_UP_CONTRACT = `
Decide whether a follow-up is warranted. Ask one only when the answer left
something genuinely unresolved — a claim with no evidence, a number with no
basis, a question dodged, or a detail worth pushing on. If the answer was
complete, ask nothing.

Return strict JSON, no markdown fence, matching exactly:
{
  "should_follow_up": <true|false>,
  "question_text": "<the follow-up, or null>",
  "reason": "<one short sentence on why you did or did not ask>"
}

If you do ask, it must refer to something they actually said — quote or
paraphrase their own words so it lands as listening, not as the next item on a
list. Keep it to one sentence, conversational, the way it would be spoken.`

/** Shared across every mode, so scoring stays comparable on the progress chart. */
const SHARED_SCORING_CONTRACT = `
Return strict JSON, no markdown fence, matching exactly:
{
  "relevance_score": <0-100>,
  "clarity_score": <0-100>,
  "confidence_score": <0-100>,
  "completeness_score": <0-100>,
  "strengths": "<2-3 sentences on what worked>",
  "improvements": "<2-3 sentences on what to fix>",
  "suggestions": "<one concrete, actionable rewrite or tactic>",
  "follow_up_tip": "<one sentence of forward guidance>"
}

Score honestly. An average answer is 60-70, not 85. Reserve above 90 for
answers that would genuinely impress. Quote the candidate's own words when
pointing at a problem so the feedback is anchored and not generic.

The answer text is a speech-to-text transcript. Ignore punctuation and
capitalisation artefacts, and never penalise spelling — the user spoke this,
they did not type it.`

/**
 * Confidence is inferred from transcript wording alone (hedging, retraction,
 * self-correction), not from voice analysis. Keep the model honest about that
 * so the score means one consistent thing across modes.
 */
const CONFIDENCE_CAVEAT = `
For confidence_score, judge only what the wording reveals — hedging
("I guess", "maybe", "sort of"), retractions, or trailing off. You cannot hear
tone, so do not pretend to assess it.`

export const MODES = {
  job_interview: {
    id: 'job_interview',
    label: 'Job Interview',
    tagline: 'Practice for a role you are applying to',

    source: {
      label: 'Job Description',
      placeholder:
        'Paste the full job description here including responsibilities, requirements, and about the company...',
      minLength: 120,
    },
    // The only mode that takes a second document. Drives CV gap analysis.
    secondarySource: {
      label: 'Your CV',
      placeholder: 'Optional — paste your CV to get questions that probe gaps against this role.',
      optional: true,
    },

    questionTypes: ['behavioral', 'situational', 'technical', 'general'],

    buildQuestionPrompt: ({ source, secondarySource, count }) => `
You are an experienced hiring manager preparing to interview a candidate for
the role below. Write ${count} interview questions you would actually ask.

JOB DESCRIPTION:
${source}
${
  secondarySource
    ? `\nCANDIDATE'S CV:\n${secondarySource}\n\nWhere the CV makes a broad claim ("led a team", "improved performance"), ask a question that forces specifics. Where the role needs something the CV does not evidence, probe it directly but fairly.`
    : ''
}

Rules:
- Weight toward behavioral and situational. These are spoken aloud, so avoid
  anything requiring a whiteboard, code, or long calculation.
- Ground each question in this specific role, not generic interview filler.
- One question each. No multi-part questions — the candidate answers by voice.

Shape it like a real conversation, not a quiz. A real interviewer eases in,
builds, then lets the candidate leave on a good note:
- Question 1 is an easy opener that lets them settle — their background, what
  drew them to this role. Never open with the hardest technical question.
- Questions 2 to N-2 build gradually. Difficulty rises; do not jump straight to
  your toughest challenge in the second question.
- Place the most demanding question around two thirds through, once they have
  warmed up.
- The final question winds down — what they want to know, where they want to
  grow, why this role now.
- Write them the way a person speaks. A short lead-in is welcome
  ("Thanks for that — I'd like to dig into something you mentioned...").
  Avoid stiff phrasing no interviewer would say out loud.

Return strict JSON, no markdown fence:
{"questions":[{"question_text":"...","question_type":"behavioral|situational|technical|general","difficulty_level":"easy|medium|hard","ideal_answer_guidelines":"what a strong answer covers"}]}`,

    buildFeedbackPrompt: ({ question, answer, source }) => `
You are an experienced hiring manager giving feedback on a spoken interview answer.

ROLE CONTEXT:
${source.slice(0, 2000)}

QUESTION: ${question.question_text}
WHAT A STRONG ANSWER COVERS: ${question.ideal_answer_guidelines ?? 'n/a'}

CANDIDATE'S SPOKEN ANSWER:
"${answer}"

Interpret the four scores for a job interview as:
- relevance: did they answer the question actually asked, and tie it to this role
- clarity: could a busy interviewer follow it the first time
- confidence: see caveat below
- completeness: for behavioral questions, whether the answer covers Situation,
  Task, Action and Result. Say explicitly which of the four are missing.
${CONFIDENCE_CAVEAT}
${SHARED_SCORING_CONTRACT}`,

    /**
     * Compare the CV against the role, after the interview.
     *
     * Deliberately not shown beforehand: telling a candidate what their CV is
     * missing primes them to work those points into their answers, which makes
     * the interview a rehearsal of the feedback rather than an honest attempt.
     *
     * The model is asked to decide whether a rewrite is warranted at all. A CV
     * that already fits the role should be left alone.
     */
    buildCvAnalysisPrompt: ({ source, secondarySource }) => `
You are a hiring manager who has just interviewed this candidate for the role
below, and is now reviewing their CV against it.

JOB DESCRIPTION:
${source}

CANDIDATE'S CV:
${secondarySource}

Judge how well the CV supports an application for this specific role.

Decide first whether a rewrite is actually warranted. If the CV already
evidences what the role asks for, say so and return empty lists — do not
manufacture problems to seem useful.

If it does not, identify:
- "missing": requirements named in the job description that the CV never
  evidences at all.
- "vague": claims the CV does make, but too softly to survive scrutiny —
  unquantified results, team achievements with no personal contribution,
  "familiar with" hedging.

Return strict JSON, no markdown fence, matching exactly:
{
  "matches_role": <true|false>,
  "match_score": <0-100>,
  "verdict": "<one sentence a candidate can act on>",
  "missing": [{"title":"<the requirement>","detail":"<why it matters for this role>","suggestion":"<the concrete line to add>"}],
  "vague": [{"title":"<quote the CV phrase>","detail":"<why it is too soft>","suggestion":"<the rewritten line>"}]
}

Set matches_role to false only when the gaps would genuinely cost them the
role. At most four entries per list, strongest first.`,

    buildFollowUpPrompt: ({ question, answer }) => `
You are the hiring manager mid-interview. You just asked:

"${question.question_text}"

The candidate answered:
"${answer}"

Follow up when they claimed a result without a number, described a team effort
without saying what they personally did, or drifted off the question. Do not
follow up merely to test something new — that is what the next question is for.
${FOLLOW_UP_CONTRACT}`,
  },

  oral_exam: {
    id: 'oral_exam',
    label: 'Oral Exam',
    tagline: 'Practice explaining course material out loud',

    source: {
      label: 'Syllabus or Notes',
      placeholder:
        'Paste your syllabus, lecture notes, or the textbook chapter you are being examined on...',
      minLength: 120,
    },
    secondarySource: null,

    questionTypes: ['general', 'technical'],

    buildQuestionPrompt: ({ source, count }) => `
You are an examiner setting an oral exam on the material below. Write ${count}
questions that test whether the student genuinely understands it.

COURSE MATERIAL:
${source}

Rules:
- Test understanding, not recall of trivia. Prefer "explain why", "compare",
  "what would happen if" over "define X".
- Every question must be answerable from the material provided. Do not reach
  outside it.
- These are spoken answers, so no calculations or diagrams.
- Cover the breadth of the material rather than clustering on one topic.
- Build from foundational to demanding.

Return strict JSON, no markdown fence:
{"questions":[{"question_text":"...","question_type":"general|technical","difficulty_level":"easy|medium|hard","ideal_answer_guidelines":"the key concepts a correct answer must contain"}]}`,

    buildFeedbackPrompt: ({ question, answer, source }) => `
You are an examiner marking a spoken answer in an oral exam.

COURSE MATERIAL (the source of truth — mark against this, not outside knowledge):
${source.slice(0, 3000)}

QUESTION: ${question.question_text}
KEY CONCEPTS A CORRECT ANSWER MUST CONTAIN: ${question.ideal_answer_guidelines ?? 'n/a'}

STUDENT'S SPOKEN ANSWER:
"${answer}"

Interpret the four scores for an oral exam as:
- relevance: did they answer this question, or drift to an adjacent topic
- clarity: is the explanation followable and correctly sequenced
- confidence: see caveat below
- completeness: which required concepts they covered and which they missed.
  Name the missing ones explicitly.

Factual accuracy is paramount. If the student states something the material
contradicts, say so plainly in "improvements" and cap relevance_score at 50.
Do not award marks for confident-sounding but incorrect content.
${CONFIDENCE_CAVEAT}
${SHARED_SCORING_CONTRACT}`,

    buildFollowUpPrompt: ({ question, answer }) => `
You are the examiner mid-exam. You just asked:

"${question.question_text}"

The student answered:
"${answer}"

Follow up when they used a term without defining it, stated a result without
the reasoning, or covered only part of the concept. A probe that makes them
show their working is worth more than a new topic.
${FOLLOW_UP_CONTRACT}`,
  },

  viva_defense: {
    id: 'viva_defense',
    label: 'Viva / Defense',
    tagline: 'Rehearse defending your own project',

    source: {
      label: 'Project Proposal or Abstract',
      placeholder:
        'Paste your project proposal, abstract, or thesis summary. The AI panel will challenge what you claim in it...',
      minLength: 120,
    },
    secondarySource: null,

    questionTypes: ['general', 'technical', 'situational'],

    buildQuestionPrompt: ({ source, count }) => `
You are a examination panel member who has read the project below and is
preparing to challenge the student on it. Write ${count} questions you would ask.

STUDENT'S PROJECT:
${source}

Rules:
- Challenge the work, do not summarise it. Target methodology choices,
  unstated assumptions, scope limitations, and what the student would do
  differently.
- At least one question must ask them to justify a decision they made over an
  obvious alternative.
- At least one must probe a limitation or weakness the project has, whether or
  not the proposal admits it.
- Ask about their specific contribution and what is genuinely novel in it.
- Be demanding but fair. These are the questions a real panel asks — not traps.
- Spoken answers, so nothing requiring notation or a diagram.

Return strict JSON, no markdown fence:
{"questions":[{"question_text":"...","question_type":"general|technical|situational","difficulty_level":"easy|medium|hard","ideal_answer_guidelines":"what a convincing defense of this point looks like"}]}`,

    buildFeedbackPrompt: ({ question, answer, source }) => `
You are a examination panel member assessing how well a student defended their
project under questioning.

STUDENT'S PROJECT:
${source.slice(0, 3000)}

QUESTION ASKED: ${question.question_text}
WHAT A CONVINCING DEFENSE COVERS: ${question.ideal_answer_guidelines ?? 'n/a'}

STUDENT'S SPOKEN ANSWER:
"${answer}"

Interpret the four scores for a viva as:
- relevance: did they defend the point actually challenged, or deflect
- clarity: could a panel unfamiliar with the details follow the justification
- confidence: see caveat below
- completeness: did they justify the decision, acknowledge the limitation
  honestly, and show command of their own work

Reward candid acknowledgement of limitations paired with sound reasoning —
that reads as mastery. Penalise defensiveness, vagueness, and any claim the
project itself does not support.
${CONFIDENCE_CAVEAT}
${SHARED_SCORING_CONTRACT}`,

    buildFollowUpPrompt: ({ question, answer }) => `
You are on the examination panel. You just challenged the student with:

"${question.question_text}"

They responded:
"${answer}"

Follow up when they deflected, justified a choice without naming what they
rejected, or claimed a contribution without bounding it. Panels press the same
point twice — that is how they find the edge of someone's understanding.
${FOLLOW_UP_CONTRACT}`,
  },
}

/** @throws if the id is not a known mode — callers should validate user input first. */
export function getMode(modeId) {
  const mode = MODES[modeId]
  if (!mode) {
    throw new Error(`Unknown practice mode "${modeId}". Expected one of: ${MODE_IDS.join(', ')}`)
  }
  return mode
}

export function isValidMode(modeId) {
  return Object.hasOwn(MODES, modeId)
}
