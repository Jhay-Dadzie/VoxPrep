import Joi from 'joi';
import { MODE_IDS } from './modes.js';

/**
 * POST /api/interviews/questions
 *
 * The per-mode minimum length is enforced in the service, where the mode is
 * known. This only guarantees the shape and the outer bounds.
 */
export const generateQuestionsSchema = Joi.object({
  mode: Joi.string()
    .valid(...MODE_IDS)
    .required()
    .messages({ 'any.only': `mode must be one of: ${MODE_IDS.join(', ')}` }),

  source: Joi.string().trim().min(1).max(20000).required().messages({
    'string.empty': 'Source material is required.',
    'string.max': 'Source material is too long (20000 character limit).',
  }),

  // Only job_interview supplies this; other modes are rejected by the service.
  secondarySource: Joi.string().trim().max(20000).allow('', null).default(null),

  count: Joi.number().integer().min(3).max(15).default(10),

  // Optional label for the saved session. job_descriptions.title is NOT NULL,
  // so the repository derives one from the document when this is absent.
  title: Joi.string().trim().max(255).allow('', null).default(null),
});

/**
 * POST /api/interviews/cv-analysis
 *
 * Run after an interview, not before — see buildCvAnalysisPrompt in modes.js.
 */
export const cvAnalysisSchema = Joi.object({
  mode: Joi.string()
    .valid(...MODE_IDS)
    .required(),

  source: Joi.string().trim().min(1).max(20000).required().messages({
    'string.empty': 'The job description is required to compare against.',
  }),

  secondarySource: Joi.string().trim().min(1).max(20000).required().messages({
    'string.empty': 'A CV is required.',
  }),
});

/**
 * POST /api/interviews/follow-up
 *
 * The answer is a speech-to-text transcript, so it can be long and messy.
 */
export const followUpSchema = Joi.object({
  mode: Joi.string()
    .valid(...MODE_IDS)
    .required()
    .messages({ 'any.only': `mode must be one of: ${MODE_IDS.join(', ')}` }),

  question: Joi.object({
    question_text: Joi.string().trim().min(1).required(),
    question_type: Joi.string().allow('', null),
    difficulty_level: Joi.string().allow('', null),
  })
    .unknown(true)
    .required(),

  answer: Joi.string().trim().min(1).max(20000).required().messages({
    'string.empty': 'An answer is required to follow up on.',
  }),
});
