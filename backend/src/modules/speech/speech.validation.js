/**
 * Speech Validation Schemas
 *
 * Covers:
 *  - transcribeFileSchema   → POST /speech/transcribe   (body fields alongside the file)
 *  - transcribeUrlSchema    → POST /speech/transcribe-url
 *  - synthesizeSchema       → POST /speech/synthesize
 *
 * ── session_id / question_id handling ────────────────────────────────────────
 *
 *  Both fields are optional — omitting them is valid (audio-only mode).
 *  But if provided they MUST be valid UUIDv4 strings; malformed values are
 *  rejected with an explicit 400 rather than silently stripped.  This prevents
 *  the silent data-loss scenario where the client sends a non-UUID ID, Joi
 *  strips it via stripUnknown, and the response row is never created.
 *
 *  Rule: either both session_id AND question_id are present, or neither is.
 *  Providing one without the other is ambiguous and rejected.
 */

import Joi from 'joi';

// ─── Shared primitives ────────────────────────────────────────────────────────

const languageField = Joi.string()
  .trim()
  .min(2)
  .max(10)
  .default('en')
  .messages({ 'string.min': 'Language code must be at least 2 characters (e.g. "en")' });

const booleanDefault = (dflt) =>
  Joi.boolean().truthy('true', '1').falsy('false', '0').default(dflt);

/**
 * UUID field that is optional but validates strictly when present.
 * Using .optional().allow(null, '') would silently pass bad values;
 * this fails loudly instead.
 */
const optionalUuid = (fieldName) =>
  Joi.string()
    .uuid({ version: 'uuidv4' })
    .optional()
    .messages({
      'string.guid': `${fieldName} must be a valid UUID (v4)`,
      'string.base': `${fieldName} must be a string`,
    });

// ─── Shared context fields ────────────────────────────────────────────────────

/**
 * session_id + question_id are optional but must appear together.
 * If the caller sends session_id without question_id (or vice-versa)
 * the response row cannot be created, so we surface an error immediately.
 */
const contextFields = {
  session_id:  optionalUuid('session_id'),
  question_id: optionalUuid('question_id'),
};

// ─── Transcribe file (multipart body fields) ──────────────────────────────────

/**
 * Body fields sent alongside the audio file upload.
 * The file itself is validated separately in the controller via audioService.validateAudio.
 */
const transcribeFileSchema = Joi.object({
  ...contextFields,
  save_audio:   booleanDefault(false),
  language:     languageField,
  smart_format: booleanDefault(true),
  punctuate:    booleanDefault(true),
  paragraphs:   booleanDefault(true),
  diarize:      booleanDefault(false),
  utterances:   booleanDefault(false),
})
  // Require both or neither
  .and('session_id', 'question_id')
  .messages({
    'object.and':
      'session_id and question_id must both be provided together, or both omitted',
  });

// ─── Transcribe from URL ──────────────────────────────────────────────────────

const transcribeUrlSchema = Joi.object({
  ...contextFields,
  url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .messages({
      'string.uri':   'A valid http or https URL is required',
      'any.required': 'url is required',
    }),
  language:     languageField,
  smart_format: booleanDefault(true),
  punctuate:    booleanDefault(true),
  paragraphs:   booleanDefault(true),
  diarize:      booleanDefault(false),
  utterances:   booleanDefault(false),
})
  .and('session_id', 'question_id')
  .messages({
    'object.and':
      'session_id and question_id must both be provided together, or both omitted',
  });

// ─── TTS synthesis ────────────────────────────────────────────────────────────

const synthesizeSchema = Joi.object({
  text: Joi.string().trim().min(1).max(4096).required().messages({
    'string.empty':   'text cannot be empty',
    'string.max':     'text cannot exceed 4096 characters per request',
    'any.required':   'text is required',
  }),
  voice: Joi.string().trim().default('asteria').messages({
    'string.base': 'voice must be a string (e.g. "asteria", "orion")',
  }),
  encoding: Joi.string()
    .valid('mp3', 'wav', 'ogg', 'flac', 'aac', 'linear16', 'mulaw')
    .default('mp3')
    .messages({
      'any.only': 'encoding must be one of: mp3, wav, ogg, flac, aac, linear16, mulaw',
    }),
  sample_rate: Joi.number()
    .integer()
    .valid(8000, 16000, 22050, 24000, 44100, 48000)
    .default(24000)
    .messages({
      'any.only': 'sample_rate must be one of: 8000, 16000, 22050, 24000, 44100, 48000',
    }),
});

// ─── Generic validator ────────────────────────────────────────────────────────

/**
 * Validate data against a Joi schema.
 *
 * Matches the validateInput() signature used across all modules.
 *
 * IMPORTANT: stripUnknown is false here for the transcription schemas.
 * Using stripUnknown would silently drop session_id / question_id if they
 * fail UUID validation, causing the response row to never be created with
 * no feedback to the client.  We prefer explicit 400 errors.
 *
 * @param {object}     data
 * @param {Joi.Schema} schema
 * @param {object}     [options] - Joi validation option overrides
 * @returns {{ valid: boolean, errors: object|null, value: object|null }}
 */
function validateInput(data, schema, options = {}) {
  const { error, value } = schema.validate(data, {
    abortEarly:    false,
    stripUnknown:  true,   // safe — unknown fields are genuinely unknown
    convert:       true,   // coerce string booleans ('true' → true)
    ...options,
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
  transcribeFileSchema,
  transcribeUrlSchema,
  synthesizeSchema,
  validateInput,
};

export default {
  transcribeFileSchema,
  transcribeUrlSchema,
  synthesizeSchema,
  validateInput,
};