/**
 * Session Assessment Prompt Builder
 *
 * Grades a whole interview in one request instead of one request per answer.
 *
 * Two reasons it works this way. The obvious one is rate limits: a 15-question
 * interview was 15 calls, and this is one. The better one is that a
 * semi-structured interview cannot be graded answer-by-answer without losing
 * the plot — half the questions are follow-ups, so an answer that reads as thin
 * in isolation is often the candidate finishing a point they started two
 * questions earlier. The grader sees the whole conversation, in order, exactly
 * as the interviewer did.
 *
 * Pure string-building — no network calls, no DB access — matching the other
 * prompt builders in this directory.
 */

const JOB_CONTENT_CHAR_LIMIT = 3000;

/**
 * Per-answer transcript budget. Fifteen full answers plus the source material
 * would crowd the context; this is generous for a spoken answer and keeps the
 * whole session comfortably inside one request.
 */
const ANSWER_CHAR_LIMIT = 2500;

function truncate(text, limit = JOB_CONTENT_CHAR_LIMIT) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function buildAssessmentSystemPrompt() {
  return [
    'You are a senior interviewer grading a completed interview.',
    'You are given every question that was asked and the candidate\'s verbatim spoken answer to each, in the order they happened.',
    'Grade each answer on its own merits, but read them in context: this was a semi-structured interview, so many questions are follow-ups and an answer may complete a point begun earlier.',
    'You must NOT write new interview questions, continue the interview, or address the candidate as though the interview is still running.',
    'The answers are speech transcripts. Judge what was said, not how it was punctuated — do not penalise for transcription artefacts, false starts or spoken grammar.',
    'Score honestly. A vague, evasive or off-topic answer scores low even if it was delivered fluently.',
    'Write feedback in the second person, addressed to the candidate.',
  ].join(' ');
}

/**
 * @param {object} input
 * @param {Array<{questionText: string, questionType?: string, difficultyLevel?: string, idealAnswerGuidelines?: string, answerText: string}>} input.answers
 * @param {string} [input.jobTitle]
 * @param {string} [input.companyName]
 * @param {string} [input.industry]
 * @param {string} [input.experienceLevel]
 * @param {string} [input.jobContent]
 * @returns {string}
 */
function buildAssessmentUserPrompt({
  answers = [],
  jobTitle,
  companyName,
  industry,
  experienceLevel,
  jobContent,
}) {
  const context = [
    `Role: ${jobTitle || 'Not specified'}${companyName ? ` at ${companyName}` : ''}`,
    industry ? `Industry: ${industry}` : null,
    experienceLevel ? `Target experience level: ${experienceLevel}` : null,
    jobContent ? `Source material excerpt:\n${truncate(jobContent)}` : null,
  ].filter(Boolean);

  const transcript = answers
    .map((answer, position) => {
      const lines = [
        `--- ANSWER ${position} ---`,
        `Question (${answer.questionType || 'general'}, ${answer.difficultyLevel || 'medium'} difficulty):`,
        answer.questionText,
      ];

      if (answer.idealAnswerGuidelines) {
        lines.push(`What a strong answer should cover: ${answer.idealAnswerGuidelines}`);
      }

      lines.push(`Candidate said: ${truncate(answer.answerText, ANSWER_CHAR_LIMIT)}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return [
    context.join('\n'),
    '',
    `The interview had ${answers.length} answered question${answers.length === 1 ? '' : 's'}.`,
    '',
    transcript,
    '',
    'Return ONLY valid JSON in exactly this shape:',
    `{
  "answers": [
    {
      "index": 0,
      "relevance_score": 0-100,
      "completeness_score": 0-100,
      "technical_accuracy_score": 0-100,
      "clarity_score": 0-100,
      "confidence_score": 0-100,
      "overall_score": 0-100,
      "strengths": ["2-4 short strings"],
      "improvements": ["2-4 short strings"],
      "summary": "2-3 sentences"
    }
  ],
  "session_summary": "3-4 sentences on the interview as a whole: the pattern across answers, not a restatement of any single one"
}`,
    '',
    `Return exactly ${answers.length} entr${answers.length === 1 ? 'y' : 'ies'} in "answers", one per ANSWER block, each carrying the "index" number from its block header. Do not merge, skip or reorder them.`,
  ].join('\n');
}

export { buildAssessmentSystemPrompt, buildAssessmentUserPrompt, JOB_CONTENT_CHAR_LIMIT, ANSWER_CHAR_LIMIT };

export default {
  buildAssessmentSystemPrompt,
  buildAssessmentUserPrompt,
  JOB_CONTENT_CHAR_LIMIT,
  ANSWER_CHAR_LIMIT,
};
