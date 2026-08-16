import { resolveMode } from '../../interviews/modes.js';

/**
 * Source material is capped before it reaches the model. A pasted job
 * description is normally 2-6k characters, but an uploaded PDF can carry a
 * whole handbook, and the tail is almost always boilerplate (benefits, EEO
 * statements, page furniture) that pushes the useful text out of focus.
 */
const MAX_SOURCE_CHARS = 12000;

const truncateSource = (content = '') => {
  const text = String(content).trim();
  if (text.length <= MAX_SOURCE_CHARS) return text;

  return `${text.slice(0, MAX_SOURCE_CHARS)}\n\n[content truncated]`;
};

/**
 * Difficulty spread, so a 10-question set escalates instead of sitting at
 * "medium" throughout. The model is told the target counts explicitly because
 * asking for "a mix" reliably produces an all-medium set.
 */
const difficultySpread = (count) => {
  const easy = Math.max(1, Math.round(count * 0.25));
  const hard = Math.max(1, Math.round(count * 0.3));
  const medium = Math.max(1, count - easy - hard);

  return { easy, medium, hard };
};

export const buildQuestionPrompt = (jobData, { questionCount = 10, mode: modeId } = {}) => {
  const mode = resolveMode(modeId);
  const { easy, medium, hard } = difficultySpread(questionCount);

  const skills = Array.isArray(jobData.key_skills) && jobData.key_skills.length
    ? jobData.key_skills.join(', ')
    : 'not specified';

  return [
    {
      role: 'system',
      content: [
        `You are ${mode.persona}.`,
        'You write realistic, high-signal questions that could only have been written by someone who actually read the source material.',
        'You never produce generic questions that would fit any candidate or any topic.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `
Generate exactly ${questionCount} questions from the ${mode.sourceLabel} below.

Title: ${jobData.title}
Organisation: ${jobData.company_name || 'not specified'}
Field: ${jobData.industry || 'not specified'}
Level: ${jobData.required_experience_level || 'mid'}
Key skills: ${skills}

--- SOURCE MATERIAL ---
${truncateSource(jobData.job_content)}
--- END SOURCE MATERIAL ---

Rules:
- Ground every question in something specific from the source. If a question would still make sense with a different source, rewrite it.
- Question types: ${mode.typeMix}.
- Difficulty: exactly ${easy} easy, ${medium} medium, ${hard} hard.
- Order the questions so difficulty broadly escalates: open with an accessible one, close with the hardest.
- No two questions may test the same thing. If two are close, replace one.
- One question per entry. Do not bundle several asks behind one question mark.
- Write them to be spoken aloud by an interviewer: plain sentences, no markdown, no numbering, no bracketed stage directions.
- ideal_answer_guidelines: 1-3 sentences naming what a strong answer must contain, written for a grader, not for the candidate.

${mode.guidance.map((line) => `- ${line}`).join('\n')}

Return ONLY valid JSON in exactly this shape:
{
  "questions": [
    {
      "question_text": "string",
      "question_type": "behavioral|technical|situational|general",
      "difficulty_level": "easy|medium|hard",
      "ideal_answer_guidelines": "string"
    }
  ]
}
`.trim(),
    },
  ];
};

export default { buildQuestionPrompt };
