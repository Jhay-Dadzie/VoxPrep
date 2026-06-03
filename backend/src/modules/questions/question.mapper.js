export const mapQuestion = (question) => ({
  id: question.id,
  questionNumber: question.question_number,
  questionText: question.question_text,
  type: question.question_type,
  difficulty: question.difficulty_level,
  idealAnswer: question.ideal_answer_guidelines,
  generatedAt: question.generated_at,
  aiModelUsed: question.ai_model_used,
});
