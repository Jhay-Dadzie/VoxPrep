import { resolveMode, resolvePaper } from '../../interviews/modes.js';

/**
 * The prompt for a written multiple-choice paper.
 *
 * Different in kind from question.prompt.js, which writes questions for a person
 * to answer out loud and a grader to judge. Here the model writes the marking
 * scheme too: the correct option and the reason it is correct are generated in
 * the same breath as the question, and are the only thing standing between a
 * student and a wrong mark. So most of this prompt's length is spent on the
 * properties that make a paper markable at all — one defensible answer, three
 * distractors that are actually wrong, and no tell in how the options are
 * written.
 */

const MAX_SOURCE_CHARS = 12000;

const truncateSource = (content = '') => {
  const text = String(content).trim();
  if (text.length <= MAX_SOURCE_CHARS) return text;

  return `${text.slice(0, MAX_SOURCE_CHARS)}\n\n[content truncated]`;
};

/** 'A', 'B', 'C', ... for the requested number of options. */
export const optionLabels = (count) =>
  Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));

/**
 * Difficulty spread across the paper. Told as explicit counts because asking
 * for "a mix" reliably produces thirty medium questions.
 */
const difficultySpread = (count) => {
  const easy = Math.max(1, Math.round(count * 0.3));
  const hard = Math.max(1, Math.round(count * 0.25));
  const medium = Math.max(1, count - easy - hard);

  return { easy, medium, hard };
};

/**
 * @param {object} jobData - title, industry, job_content, key_skills, ...
 * @param {object} [options]
 * @param {number} [options.questionCount] - how many questions this call must return
 * @param {string} [options.mode] - practice mode id
 * @param {string[]} [options.avoid] - question texts already on the paper, to not repeat
 * @param {number} [options.startNumber] - where this batch sits on the paper, for pacing
 * @param {number} [options.totalCount] - the full paper length, for pacing
 */
export const buildExamPrompt = (
  jobData,
  { questionCount, mode: modeId, avoid = [], startNumber = 1, totalCount } = {}
) => {
  const mode = resolveMode(modeId);
  const paper = resolvePaper(modeId) || { questionCount: 30, optionCount: 4 };
  const count = questionCount || paper.questionCount;
  const total = totalCount || count;
  const labels = optionLabels(paper.optionCount);
  const { easy, medium, hard } = difficultySpread(count);

  const topics = Array.isArray(jobData.key_skills) && jobData.key_skills.length
    ? jobData.key_skills.join(', ')
    : 'not specified';

  // Only the question text is sent back, and only for questions already on the
  // paper. It is the cheapest thing that prevents batch two from re-asking
  // batch one, and it costs a fraction of resending whole questions.
  const avoidBlock = avoid.length
    ? `
ALREADY ON THIS PAPER — do not ask any of these again, and do not rephrase them:
${avoid.map((text) => `- ${text}`).join('\n')}
`
    : '';

  return [
    {
      role: 'system',
      content: [
        `You are ${mode.persona}.`,
        'You set papers that can be marked without argument: every question has exactly one defensible answer, and every wrong option is wrong for a reason a student could name.',
        'You never test anything the source material does not cover, and you never write a question that would fit any other course.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `
Write exactly ${count} multiple-choice questions from the ${mode.sourceLabel} below${
        total !== count
          ? `. They are questions ${startNumber} to ${startNumber + count - 1} of a ${total}-question paper`
          : ''
      }.

Title: ${jobData.title}
Field: ${jobData.industry || 'not specified'}
Level: ${jobData.required_experience_level || 'mid'}
Key topics: ${topics}

--- SOURCE MATERIAL ---
${truncateSource(jobData.job_content)}
--- END SOURCE MATERIAL ---
${avoidBlock}
Rules:
- Every question must be answerable from the source material alone. If answering needs outside knowledge, rewrite it.
- Exactly ${paper.optionCount} options per question, labelled ${labels.join(', ')}, and exactly one of them correct.
- Spread the correct answer across the labels. Do not let one label carry most of them.
- Options must be of similar length and grammatical form. Length, hedging or detail must never signal which one is right.
- Never use "All of the above", "None of the above", "Both A and B", or any option that refers to another option.
- Difficulty: ${easy} easy, ${medium} medium, ${hard} hard.
- No two questions may test the same fact. If two are close, replace one.
- Ask one thing per question. Do not bundle two asks behind one question mark.
- Plain text only: no markdown, no numbering, no "Question 4:" prefix, no LaTeX.
- explanation: one or two sentences saying why the correct option is correct, grounded in the material. Write it for a student who picked wrongly and wants to understand, not for a grader. Do not begin with "The correct answer is".
- topic: two to four words naming the part of the material the question comes from.

${mode.guidance.map((line) => `- ${line}`).join('\n')}

Return ONLY valid JSON in exactly this shape:
{
  "questions": [
    {
      "question_text": "string",
      "options": [${labels.map((label) => `{ "label": "${label}", "text": "string" }`).join(', ')}],
      "correct_option": "${labels.join('|')}",
      "explanation": "string",
      "topic": "string",
      "difficulty_level": "easy|medium|hard"
    }
  ]
}
`.trim(),
    },
  ];
};

export default { buildExamPrompt, optionLabels };
