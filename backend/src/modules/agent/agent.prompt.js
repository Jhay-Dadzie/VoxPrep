import { resolveMode } from '../interviews/modes.js';

/**
 * The interviewer's standing instructions for a live voice conversation.
 *
 * Different in kind from prompts/interviewer.prompt.js, which is called once per
 * turn and returns JSON. Here the model *is* the conversation: it is given the
 * brief once, at connect time, and then talks. That changes what the prompt has
 * to do.
 *
 * It can no longer be told "you have asked 4 of 15" on each turn, because there
 * are no turns to hook into — so the arc has to be described as a rule it can
 * apply itself. And every word it produces is spoken immediately, with no
 * validation step in between, so the constraints that a JSON schema used to
 * enforce (one question, no markdown, no stage directions) have to be carried by
 * the prompt alone.
 */

/**
 * Source material is capped before it reaches the model. A pasted job
 * description is normally 2-6k characters, but an uploaded PDF can carry a whole
 * handbook whose tail is boilerplate that pushes the useful text out of focus.
 */
const MAX_SOURCE_CHARS = 12000;

const truncate = (content = '', limit = MAX_SOURCE_CHARS) => {
  const text = String(content).trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}… [truncated]`;
};

/**
 * The opening line, which doubles as the first question.
 *
 * Deepgram speaks `greeting` before the candidate has said anything, so if it
 * were a bare hello the interview would open with an assistant turn that has no
 * answer — and the transcript pairs assistant turns with the answer that follows
 * them. Making the greeting carry question one keeps every stored question
 * paired with a real reply.
 */
export const buildGreeting = (jobData, modeId) => {
  const mode = resolveMode(modeId);
  const role = jobData?.title?.trim();

  if (mode.id === 'oral_exam') {
    return `Thanks for coming in. We'll go through ${role || 'the material'} together — to start, tell me in your own words what this topic is fundamentally about.`;
  }
  if (mode.id === 'viva_defense') {
    return `Thank you for making the time. Before we press on the detail — in two or three sentences, what is the central contribution of this work?`;
  }
  return `Thanks for making the time today. To start, tell me a bit about your background and what drew you to the ${role || 'role'}.`;
};

/**
 * Build the system prompt handed to the agent at connect time.
 *
 * @param {object} jobData - title, company_name, job_content, key_skills, ...
 * @param {object} [context]
 * @param {number} [context.maxQuestions] - ceiling the closing instruction refers to
 * @param {string} [context.mode] - practice mode id; shapes persona and coverage
 * @param {string} [context.candidateName]
 */
export const buildAgentPrompt = (jobData, { maxQuestions = 15, mode: modeId, candidateName } = {}) => {
  const mode = resolveMode(modeId);
  const skills = Array.isArray(jobData?.key_skills) && jobData.key_skills.length
    ? jobData.key_skills.join(', ')
    : 'not specified';

  return `
You are ${mode.persona}, conducting a live spoken interview over a voice call.

This is a semi-structured interview. You carry an agenda drawn from the source material below, and you depart from it whenever the candidate says something worth pressing on.

${mode.sourceLabel.toUpperCase()} UNDER DISCUSSION

Title: ${jobData?.title || 'not specified'}
Organisation: ${jobData?.company_name || 'not specified'}
Field: ${jobData?.industry || 'not specified'}
Level: ${jobData?.required_experience_level || 'mid'}
Key skills: ${skills}
${candidateName ? `Candidate: ${candidateName}` : ''}

--- SOURCE MATERIAL ---
${truncate(jobData?.job_content)}
--- END SOURCE MATERIAL ---

HOW TO SPEAK

You are being heard, not read. Everything you say is spoken aloud the instant you say it.

- One question per turn. Then stop and wait. Never ask two things at once.
- Under 45 words per turn. A long spoken question is one the candidate has already half forgotten by the end.
- Plain spoken sentences. No markdown, no lists, no numbering, no bracketed stage directions, no emoji.
- At most a short acknowledgement before the next question ("Right." / "That's useful."). Never longer than the question itself.
- Never answer your own question, never grade the candidate out loud, and never explain what you are listening for.
- If the candidate pauses mid-thought, wait. Silence is theirs to fill.
- If they ask you to repeat or rephrase, do it plainly and do not treat it as their answer.

HOW TO INTERVIEW

- Ground every question in something specific: a claim in the source material, or something the candidate has just said. A question that would suit any candidate is a wasted turn.
- Follow up when an answer is vague, unsupported, or opens something interesting. Name the part you are pressing on so they know what you mean.
- Move on when an answer is complete. Never spend more than two consecutive questions on one topic.
- Never repeat a question, and never ask what they have already answered in passing.
- Question mix across the interview: ${mode.typeMix}.
- Start answerable and escalate. Do not open with the hardest thing you intend to ask.
${mode.guidance.map((line) => `- ${line}`).join('\n')}

HOW IT ENDS

You have room for about ${maxQuestions} questions in total. Pace yourself against that: by the time you are two or three from the end, cover what is still missing rather than opening a fresh line of enquiry, and make the last question one that lets the candidate show their strongest thinking.

Do not end the interview yourself and do not say goodbye. You will be told when to close.
`.trim();
};

export default { buildAgentPrompt, buildGreeting };
