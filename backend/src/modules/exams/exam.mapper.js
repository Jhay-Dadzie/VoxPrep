/**
 * Exam mappers.
 *
 * Nothing from exam_questions reaches a client except through one of these. The
 * split between mapSittingQuestion and mapMarkedQuestion is the marking scheme:
 * the first shape has no field to put it in, which is a stronger guarantee than
 * remembering to delete it.
 */

const mapSession = (session) => ({
  id: session.id,
  session_title: session.session_title,
  status: session.status,
  session_kind: session.session_kind || 'exam',
  total_questions: session.total_questions,
  questions_answered: session.questions_answered,
  overall_score: session.overall_score ?? null,
  started_at: session.started_at ?? null,
  completed_at: session.completed_at ?? null,
  duration_seconds: session.duration_seconds ?? null,
  job_description: session.job_descriptions
    ? {
        id: session.job_descriptions.id,
        title: session.job_descriptions.title,
        company_name: session.job_descriptions.company_name ?? null,
        industry: session.job_descriptions.industry ?? null,
        key_skills: session.job_descriptions.key_skills ?? [],
      }
    : null,
});

/** A question as it is sat: no correct option, no explanation. */
const mapSittingQuestion = (question) => ({
  id: question.id,
  question_number: question.question_number,
  question_text: question.question_text,
  options: question.options,
  topic: question.topic ?? null,
  difficulty_level: question.difficulty_level ?? null,
  selected_option: question.selected_option ?? null,
});

/** A question as it is reviewed, once the paper has been marked. */
const mapMarkedQuestion = (question) => ({
  ...mapSittingQuestion(question),
  correct_option: question.correct_option,
  explanation: question.explanation ?? null,
  is_correct: Boolean(question.is_correct),
});

export const mapExamToResponse = (exam) => ({
  session: mapSession(exam.session),
  submitted: exam.submitted,
  questions: exam.questions.map(mapSittingQuestion),
});

export const mapExamResultToResponse = (result) => ({
  session: mapSession(result.session),
  totals: result.totals,
  questions: result.questions.map(mapMarkedQuestion),
});

export const mapPreparedExamToResponse = (prepared) => ({
  session: mapSession(prepared.session),
  job_description: prepared.jobDescription
    ? {
        id: prepared.jobDescription.id,
        title: prepared.jobDescription.title,
        company_name: prepared.jobDescription.company_name ?? null,
        industry: prepared.jobDescription.industry ?? null,
        key_skills: prepared.jobDescription.key_skills ?? [],
      }
    : null,
  question_count: prepared.questionCount,
  option_count: prepared.optionCount,
});

export default { mapExamToResponse, mapExamResultToResponse, mapPreparedExamToResponse };
