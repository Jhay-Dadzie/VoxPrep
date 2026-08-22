// src/modules/interviews/interviewSession.validation.js
import Joi from 'joi';
import { ACCEPTED_MODE_IDS } from './modes.js';

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

/**
 * POST /interviews/:id/turn
 *
 * `mode` rides on every turn rather than being stored on the session: it shapes
 * the interviewer's persona only, interview_sessions has no column for it, and
 * a migration to persist a prompt detail is not worth the coupling.
 *
 * `max_questions` lets a client run a shorter interview. It is clamped to the
 * server's ceiling in the service, so a client cannot ask for more than 15.
 */
export const nextTurnValidation = Joi.object({
  mode: Joi.string().valid(...ACCEPTED_MODE_IDS).optional(),
  max_questions: Joi.number().integer().min(1).max(15).optional(),
  candidate_name: Joi.string().trim().max(120).allow('', null).optional(),
});

/**
 * POST /interviews/prepare
 *
 * Arrives as multipart/form-data when a document is attached, so every field
 * is a string on the wire. `convert` (Joi's default) handles the coercion;
 * job_content is optional here because the text may come from the uploaded
 * file instead, and the controller enforces that one of the two is present
 * once the document has been parsed.
 */
export const prepareSessionValidation = Joi.object({
  job_content: Joi.string().trim().allow('', null).optional(),
  title: Joi.string().trim().max(255).allow('', null).optional(),
  company_name: Joi.string().trim().max(255).allow('', null).optional(),
  required_experience_level: Joi.string()
    .valid('entry', 'junior', 'mid', 'senior', 'lead')
    .allow('', null)
    .optional(),
  industry: Joi.string().trim().max(100).allow('', null).optional(),
  // Accepted and ignored: questions are no longer generated up front. Kept so
  // an older client build's setup request is not rejected outright.
  questionCount: Joi.number().integer().min(1).max(20).optional(),
  mode: Joi.string().valid(...ACCEPTED_MODE_IDS).optional(),
  session_title: Joi.string().trim().max(255).allow('', null).optional(),
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
  nextTurnValidation,
  prepareSessionValidation,
  submitAnswerValidation
};
