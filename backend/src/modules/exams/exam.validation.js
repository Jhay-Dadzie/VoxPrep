import Joi from 'joi';
import { ACCEPTED_MODE_IDS } from '../interviews/modes.js';

/**
 * POST /exams/prepare
 *
 * Mirrors prepareSessionValidation: arrives as multipart/form-data when a
 * document is attached, so every field is a string on the wire and job_content
 * is optional here — the controller enforces that one of the two is present
 * once the document has been parsed.
 */
export const prepareExamValidation = Joi.object({
  job_content: Joi.string().trim().allow('', null).optional(),
  title: Joi.string().trim().max(255).allow('', null).optional(),
  company_name: Joi.string().trim().max(255).allow('', null).optional(),
  required_experience_level: Joi.string()
    .valid('entry', 'junior', 'mid', 'senior', 'lead')
    .allow('', null)
    .optional(),
  industry: Joi.string().trim().max(100).allow('', null).optional(),
  mode: Joi.string().valid(...ACCEPTED_MODE_IDS).optional(),
  session_title: Joi.string().trim().max(255).allow('', null).optional(),
});

/**
 * PUT /exams/:sessionId/answers/:questionId
 *
 * The label is checked against the options actually on the question in the
 * service — a pattern match here only keeps obvious junk out of the query.
 */
export const saveAnswerValidation = Joi.object({
  selected_option: Joi.string().trim().uppercase().pattern(/^[A-Z]$/).required().messages({
    'string.pattern.base': 'An answer is a single option label, such as "B"',
  }),
});

export default { prepareExamValidation, saveAnswerValidation };
