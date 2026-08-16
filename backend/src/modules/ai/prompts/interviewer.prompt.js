import { resolveMode } from '../../interviews/modes.js';

/**
 * Prompt for the live interviewer — the model that decides what to ask next.
 *
 * This is the semi-structured half of the product. A structured interview would
 * read a fixed list; an unstructured one would wander. Semi-structured means the
 * interviewer carries an agenda it must cover, and is free to depart from it to
 * chase whatever the candidate just said. So the prompt supplies two things at
 * once: the coverage the mode demands, and permission to follow up.
 *
 * The model is called once per turn with the whole conversation so far, and
 * decides between asking again and closing. Nothing about the plan is persisted
 * between turns — the transcript *is* the state, which is what keeps a resumed
 * session, a retried request and a fresh one all behaving the same way.
 */

/**
 * Source material is capped before it reaches the model. A pasted job
 * description is normally 2-6k characters, but an uploaded PDF can carry a
 * whole handbook, and the tail is almost always boilerplate (benefits, EEO
 * statements, page furniture) that pushes the useful text out of focus.
 */
const MAX_SOURCE_CHARS = 12000;

/**
 * How much of each answer the interviewer sees. Full transcripts of fourteen
 * prior answers would dominate the context and push the source material out of
 * focus; the opening of an answer is what a follow-up hangs off anyway.
 */
const MAX_ANSWER_CHARS = 900;

const truncate = (content = '', limit = MAX_SOURCE_CHARS) => {
  const text = String(content).trim();
  if (text.length <= limit) return text;

  return `${text.slice(0, limit)}… [truncated]`;
};

/**
 * Where the interview is in its arc. Told to the model explicitly because it
 * cannot otherwise judge how much room is left, and an interviewer that opens a
 * brand-new topic on the last question wastes it.
 */
const describeStage = (askedCount, maxQuestions) => {
  const remaining = maxQuestions - askedCount;

  if (askedCount === 0) {
    return 'This is the opening question. Start broad and answerable — do not open with the hardest thing you intend to ask.';
  }
  if (remaining <= 1) {
    return 'This is the final question. Close on something that lets the candidate show their strongest thinking. Do not open a new topic you cannot follow up on.';
  }
  if (remaining <= 3) {
    return 'The interview is nearly over. Cover anything important still missing rather than starting a fresh line of enquiry.';
  }
  if (askedCount <= 2) {
    return 'The interview has just started. Establish the basics before pressing hard.';
  }
  return 'The interview is in its main stretch. Press for depth and specifics.';
};

/**
 * Render the conversation so far.
 *
 * An unanswered question is labelled rather than dropped: it means the
 * candidate skipped or the recording failed, and the interviewer should move on
 * instead of asking it again.
 */
const renderTranscript = (turns = []) => {
  if (turns.length === 0) return 'Nothing has been asked yet. This is the first question of the interview.';

  return turns
    .map((turn, index) => {
      const answer = turn.answer?.trim()
        ? truncate(turn.answer, MAX_ANSWER_CHARS)
        : '[no answer recorded — the candidate skipped this or the recording failed]';

      return `Q${index + 1} (${turn.question_type || 'general'}): ${turn.question}\nA${index + 1}: ${answer}`;
    })
    .join('\n\n');
};

/**
 * Build the messages for one interviewer turn.
 *
 * @param {object} jobData - title, company_name, job_content, key_skills, ...
 * @param {object} context
 * @param {Array<{question: string, question_type?: string, answer?: string}>} context.turns - the interview so far, in order
 * @param {number} context.maxQuestions - hard ceiling on questions in this session
 * @param {string} [context.mode] - practice mode id; shapes persona and coverage
 * @param {string} [context.candidateName]
 * @param {boolean} [context.forceAsk] - remove the option to close (see below)
 */
export const buildInterviewerPrompt = (jobData, { turns = [], maxQuestions = 15, mode: modeId, candidateName, forceAsk = false } = {}) => {
  const mode = resolveMode(modeId);
  const askedCount = turns.length;
  const remaining = Math.max(0, maxQuestions - askedCount);

  const skills = Array.isArray(jobData.key_skills) && jobData.key_skills.length
    ? jobData.key_skills.join(', ')
    : 'not specified';

  return [
    {
      role: 'system',
      content: [
        `You are ${mode.persona}, conducting a live spoken interview.`,
        'This is a semi-structured interview: you carry an agenda drawn from the source material, and you depart from it whenever the candidate says something worth pressing on.',
        'You ask exactly one question at a time, then wait. You never answer your own questions, never grade the candidate out loud, and never explain what you are looking for.',
        'Everything you write will be spoken aloud, so it must be a plain sentence a person would actually say.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `
${mode.sourceLabel.toUpperCase()} UNDER DISCUSSION

Title: ${jobData.title}
Organisation: ${jobData.company_name || 'not specified'}
Field: ${jobData.industry || 'not specified'}
Level: ${jobData.required_experience_level || 'mid'}
Key skills: ${skills}
${candidateName ? `Candidate: ${candidateName}` : ''}

--- SOURCE MATERIAL ---
${truncate(jobData.job_content)}
--- END SOURCE MATERIAL ---

INTERVIEW SO FAR

${renderTranscript(turns)}

WHERE YOU ARE

Questions asked: ${askedCount} of at most ${maxQuestions}. Remaining: ${remaining}.
${describeStage(askedCount, maxQuestions)}

YOUR DECISION

${forceAsk
  ? 'You must ask another question. The interview is too short to end here, so "close" is not available on this turn — set action to "ask".'
  : `Choose one:
- "ask" — put the next question to the candidate.
- "close" — end the interview because you have what you need. Choose this when the material is genuinely covered and further questions would only repeat you. Do not close before question 5 unless the candidate has stopped engaging.`}

RULES FOR THE NEXT QUESTION

- Ground it in something specific: a claim in the source material, or something the candidate actually just said. A question that would fit any candidate is a wasted turn.
- Follow up when the last answer was vague, unsupported, or opened something interesting. Quote or paraphrase the part you are pressing on so the candidate knows what you mean.
- Move on when the last answer was complete. Do not interrogate one topic for more than two consecutive questions.
- Never repeat a question already asked, and never ask something the candidate has already answered in passing.
- Question types across the interview: ${mode.typeMix}.
- Difficulty should broadly escalate as the interview proceeds.
- One ask per question. No compound questions, no lists, no preamble longer than a short acknowledgement of the previous answer.
- Write it to be spoken: plain sentences, no markdown, no numbering, no bracketed stage directions, under 60 words.
- ideal_answer_guidelines: 1-3 sentences naming what a strong answer must contain, written for a grader, not for the candidate.

${mode.guidance.map((line) => `- ${line}`).join('\n')}

Return ONLY valid JSON in exactly this shape:
{
  "action": "ask" | "close",
  "question_text": "string — the question to speak, empty when closing",
  "question_type": "behavioral|technical|situational|general",
  "difficulty_level": "easy|medium|hard",
  "ideal_answer_guidelines": "string",
  "closing_remark": "string — one or two spoken sentences thanking the candidate, only when closing"
}
`.trim(),
    },
  ];
};

export default { buildInterviewerPrompt };
