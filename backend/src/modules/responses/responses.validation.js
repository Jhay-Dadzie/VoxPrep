import Joi from 'joi';
import { MODE_IDS } from '../interviews/modes.js';

/**
 * POST /api/responses
 *
 * Audio arrives base64 in JSON for the same reason documents do — no multer,
 * and the byte-size limit is enforced once decoded.
 */
export const submitAnswerSchema = Joi.object({
  questionId: Joi.string().uuid().required().messages({
    'string.guid': 'questionId must be the id of a saved question.',
  }),

  mode: Joi.string()
    .valid(...MODE_IDS)
    .required(),

  base64: Joi.string().base64({ paddingRequired: false }).required(),

  mimeType: Joi.string().trim().max(255).allow('', null).default(null),

  /** Client-measured, used only when the transcriber reports no duration. */
  durationSeconds: Joi.number().min(0).max(3600).allow(null).default(null),
});

/** POST /api/responses/complete */
export const completeSessionSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
  durationSeconds: Joi.number().min(0).max(86400).allow(null).default(null),
});
