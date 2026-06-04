/**
 * Response Validation Schemas
 *
 * Covers:
 *  - submitResponse   → POST /responses/sessions/:sessionId/questions/:questionId
 *  - updateResponse   → PATCH /responses/:id
 *  - sessionQuery     → GET  /responses/sessions/:sessionId  (pagination + flags)
 */

import Joi from 'joi';

// ─── Submit / upsert ─────────────────────────────────────────────────────────

/**
 * POST …/sessions/:sessionId/questions/:questionId
 *
 * transcribed_text is always required on first submit.
 * Audio fields are optional — filled in by the STT pipeline or directly by the client.
 */
const submitResponseSchema = Joi.object({
  transcribed_text: Joi.string().trim().min(1).max(10_000).required().messages({
    'string.empty': 'Response text cannot be empty',
    'string.min': 'Response text must not be empty',
    'string.max': 'Response text cannot exceed 10 000 characters',
    'any.required': 'Response text is required',
  }),

  original_audio_url: Joi.string().uri().max(2048).optional().allow(null, '').messages({
    'string.uri': 'Audio URL must be a valid URI',
    'string.max': 'Audio URL cannot exceed 2048 characters',
  }),

  response_duration_seconds: Joi.number()
    .integer()
    .min(0)
    .max(3600)
    .optional()
    .allow(null)
    .messages({
      'number.min': 'Duration cannot be negative',
      'number.max': 'Duration cannot exceed 3600 seconds (1 hour)',
    }),

  transcription_confidence: Joi.number()
    .min(0)
    .max(1)
    .precision(4)
    .optional()
    .allow(null)
    .messages({
      'number.min': 'Confidence score must be between 0 and 1',
      'number.max': 'Confidence score must be between 0 and 1',
    }),
});

// ─── Update (edit transcription / swap audio) ─────────────────────────────────

/**
 * PATCH /responses/:id
 *
 * At least one field must be present.
 * transcription_confidence is intentionally excluded — clients cannot
 * manually set confidence; that is the STT pipeline's domain.
 */
const updateResponseSchema = Joi.object({
  transcribed_text: Joi.string().trim().min(1).max(10_000).optional().messages({
    'string.empty': 'Response text cannot be empty',
    'string.min': 'Response text must not be empty',
    'string.max': 'Response text cannot exceed 10 000 characters',
  }),

  original_audio_url: Joi.string().uri().max(2048).optional().allow(null, '').messages({
    'string.uri': 'Audio URL must be a valid URI',
    'string.max': 'Audio URL cannot exceed 2048 characters',
  }),

  response_duration_seconds: Joi.number()
    .integer()
    .min(0)
    .max(3600)
    .optional()
    .allow(null),
})
  .min(1)
  .strict()
  .messages({ 'object.min': 'At least one field must be provided to update' });

// ─── Session response list query ──────────────────────────────────────────────

/**
 * GET /responses/sessions/:sessionId
 * Pagination defaults to page 1, limit 20.
 * include_feedback is a boolean flag — off by default for performance.
 */
const sessionResponsesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  include_feedback: Joi.boolean().default(false),
});

// ─── Generic validator ────────────────────────────────────────────────────────

/**
 * @param {object} data
 * @param {Joi.Schema} schema
 * @param {object} [opts] - Joi override options
 * @returns {{ valid: boolean, errors: object|null, value: object|null }}
 */
function validateInput(data, schema, opts = {}) {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    ...opts,
  });

  if (error) {
    const errors = error.details.reduce((acc, detail) => {
      const key = detail.path[0] ?? '_base';
      acc[key] = detail.message;
      return acc;
    }, {});
    return { valid: false, errors, value: null };
  }

  return { valid: true, errors: null, value };
}

export {
  submitResponseSchema,
  updateResponseSchema,
  sessionResponsesQuerySchema,
  validateInput,
};

export default {
  submitResponseSchema,
  updateResponseSchema,
  sessionResponsesQuerySchema,
  validateInput,
};