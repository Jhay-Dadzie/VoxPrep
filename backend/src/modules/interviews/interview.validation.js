// src/modules/interviews/interviewSession.validation.js
import Joi from 'joi';

export const createSessionValidation = Joi.object({
  job_description_id: Joi.string().uuid().optional().allow(null),
  session_title: Joi.string().trim().max(255).optional()
});

export const getSessionsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().optional().allow('')
});

export const addQuestionValidation = Joi.object({
  question_text: Joi.string().trim().min(5).required(),
  question_type: Joi.string().valid('behavioral', 'technical', 'situational', 'general').default('general'),
  difficulty_level: Joi.string().valid('easy', 'medium', 'hard').default('medium'),
  ideal_answer_guidelines: Joi.string().optional().allow(null, '')
});

export const submitAnswerValidation = Joi.object({
  answer_text: Joi.string().trim().min(1).required(),
  audio_url: Joi.string().uri().optional().allow(null),
  response_duration_seconds: Joi.number().integer().min(0).optional(),
  transcription_confidence: Joi.number().min(0).max(1).optional()
});

export default {
  createSessionValidation,
  getSessionsQueryValidation,
  addQuestionValidation,
  submitAnswerValidation
};