/**
 * Feedback Prompt Builder
 *
 * Pure string-building — no network calls, no DB access. Lives in modules/ai/
 * so it stays reusable/testable independent of Express or Supabase, matching
 * the existing question-generation prompt builder's design.
 */

// Matches the truncation budget already used for job description content in
// question generation (see ai.service question generator) — keep AI layer
// token-budget conventions consistent across generators.
const JOB_CONTENT_CHAR_LIMIT = 3000;

function truncate(text, limit = JOB_CONTENT_CHAR_LIMIT) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function buildFeedbackSystemPrompt() {
  return `You are a senior technical interviewer evaluating a candidate's spoken answer to an interview question.

  IMPORTANT: You must NOT generate any new interview questions. You are ONLY evaluating the provided answer.
  
  Given the question and the candidate's answer, output a JSON object with the following fields:
  - relevance_score (0-100)
  - completeness_score (0-100)
  - technical_accuracy_score (0-100)
  - clarity_score (0-100)
  - confidence_score (0-100)
  - overall_score (0-100)
  - strengths: array of strings (2-4 items)
  - improvements: array of strings (2-4 items)
  - summary: string (2-3 sentences)
  
  Example output:
  {
    "relevance_score": 85,
    "completeness_score": 70,
    "technical_accuracy_score": 90,
    "clarity_score": 80,
    "confidence_score": 75,
    "overall_score": 82,
    "strengths": ["Good use of specific examples", "Clear structure"],
    "improvements": ["Could have elaborated on the impact", "Include more metrics"],
    "summary": "You provided a solid answer with good examples. To improve, quantify your achievements and connect them to the company's goals."
  }
  
  Now evaluate the following answer. Output ONLY the JSON object, no additional text.`;
}

/**
 * @param {object} input
 * @param {string} input.questionText
 * @param {string} [input.questionType]
 * @param {string} [input.difficultyLevel]
 * @param {string} [input.idealAnswerGuidelines]
 * @param {string} input.answerText
 * @param {string} [input.jobTitle]
 * @param {string} [input.companyName]
 * @param {string} [input.industry]
 * @param {string} [input.experienceLevel]
 * @param {string} [input.jobContent]
 * @returns {string}
 */
function buildFeedbackUserPrompt({
  questionText,
  questionType,
  difficultyLevel,
  idealAnswerGuidelines,
  answerText,
  jobTitle,
  companyName,
  industry,
  experienceLevel,
  jobContent,
}) {
  const lines = [
    `Role: ${jobTitle || 'Not specified'}${companyName ? ` at ${companyName}` : ''}`,
    industry ? `Industry: ${industry}` : null,
    experienceLevel ? `Target experience level: ${experienceLevel}` : null,
    jobContent ? `Job description excerpt:\n${truncate(jobContent)}` : null,
    '',
    `Question (${questionType || 'general'}, ${difficultyLevel || 'medium'} difficulty):\n${questionText}`,
    idealAnswerGuidelines ? `What a strong answer should cover:\n${idealAnswerGuidelines}` : null,
    '',
    `Candidate's answer (verbatim transcript):\n${answerText}`,
  ].filter((line) => line !== null);

  return lines.join('\n');
}

export { buildFeedbackSystemPrompt, buildFeedbackUserPrompt, JOB_CONTENT_CHAR_LIMIT };

export default { buildFeedbackSystemPrompt, buildFeedbackUserPrompt, JOB_CONTENT_CHAR_LIMIT };