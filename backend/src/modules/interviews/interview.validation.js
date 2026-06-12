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

const jobDataSchema = Joi.object({
  title: Joi.string().min(2).max(100).required(),
  company_name: Joi.string().allow('', null).optional(),
  job_content: Joi.string().min(50).required().messages({
    'string.min': 'Job content is too short to generate meaningful questions (min 50 chars)',
  }),
  key_skills: Joi.array().items(Joi.string().trim().min(1)).optional(),
  required_experience_level: Joi.string()
    .valid('entry', 'junior', 'mid', 'senior', 'lead')
    .optional(),
  industry: Joi.string().max(100).optional().allow('', null),
}).optional();

export const addQuestionValidation = Joi.object({
  questionCount: Joi.number().integer().min(1).max(20).default(10),
  jobData: jobDataSchema,
});

export const submitAnswerValidation = Joi.object({
  answer_text: Joi.string().trim().min(1).required(),
  audio_url: Joi.string().uri().optional().allow(null),
  original_audio_url: Joi.string().uri().optional().allow(null),
  storage_path: Joi.string().trim().optional().allow(null, ''),
  response_duration_seconds: Joi.number().integer().min(0).optional(),
  transcription_confidence: Joi.number().min(0).max(1).optional()
});

export default {
  createSessionValidation,
  getSessionsQueryValidation,
  addQuestionValidation,
  submitAnswerValidation
};
