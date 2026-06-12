/**
 * Speech Validation Schemas
 *
 * Covers:
 *  - transcribeFileSchema   → POST /speech/transcribe   (body fields alongside the file)
 *  - transcribeUrlSchema    → POST /speech/transcribe-url
 *  - synthesizeSchema       → POST /speech/synthesize
 *
 * Follows the same Joi pattern as auth.validation.js and user.validation.js:
 *  - .strict() on all objects so unexpected fields are rejected
 *  - Per-field messages for actionable client errors
 *  - validateInput() returns { valid, errors, value } — never throws
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

// ─── Transcribe file (multipart body fields) ──────────────────────────────────

/**
 * Body fields sent alongside the audio file upload.
 * The file itself is validated separately in the controller via audioService.validateAudio.
 */
const transcribeFileSchema = Joi.object({
  session_id:   Joi.string().uuid({ version: 'uuidv4' }).optional().messages({
    'string.guid': 'session_id must be a valid UUID',
  }),
  question_id:  Joi.string().uuid({ version: 'uuidv4' }).optional().messages({
    'string.guid': 'question_id must be a valid UUID',
  }),
  save_audio:   booleanDefault(false),
  language:     languageField,
  smart_format: booleanDefault(true),
  punctuate:    booleanDefault(true),
  paragraphs:   booleanDefault(true),
  diarize:      booleanDefault(false),
  utterances:   booleanDefault(false),
});

// ─── Transcribe from URL ──────────────────────────────────────────────────────

const transcribeUrlSchema = Joi.object({
  session_id:   Joi.string().uuid({ version: 'uuidv4' }).optional().messages({
    'string.guid': 'session_id must be a valid UUID',
  }),
  question_id:  Joi.string().uuid({ version: 'uuidv4' }).optional().messages({
    'string.guid': 'question_id must be a valid UUID',
  }),
  url:          Joi.string().uri({ scheme: ['http', 'https'] }).required().messages({
    'string.uri':     'A valid http or https URL is required',
    'any.required':   'url is required',
  }),
  language:     languageField,
  smart_format: booleanDefault(true),
  punctuate:    booleanDefault(true),
  paragraphs:   booleanDefault(true),
  diarize:      booleanDefault(false),
  utterances:   booleanDefault(false),
});

// ─── TTS synthesis ────────────────────────────────────────────────────────────

const synthesizeSchema = Joi.object({
  text: Joi.string().trim().min(1).max(4096).required().messages({
    'string.empty':   'text cannot be empty',
    'string.max':     'text cannot exceed 4096 characters per request',
    'any.required':   'text is required',
  }),
  voice:       Joi.string().trim().default('asteria').messages({
    'string.base': 'voice must be a string (e.g. "asteria", "orion")',
  }),
  encoding:    Joi.string()
    .valid('mp3', 'wav', 'ogg', 'flac', 'aac', 'linear16', 'mulaw')
    .default('mp3')
    .messages({ 'any.only': 'encoding must be one of: mp3, wav, ogg, flac, aac, linear16, mulaw' }),
  sample_rate: Joi.number()
    .integer()
    .valid(8000, 16000, 22050, 24000, 44100, 48000)
    .default(24000)
    .messages({ 'any.only': 'sample_rate must be one of: 8000, 16000, 22050, 24000, 44100, 48000' }),
});

// ─── Generic validator ────────────────────────────────────────────────────────

/**
 * Validate data against a Joi schema.
 *
 * Matches the validateInput() signature used across all modules.
 *
 * @param {object}     data
 * @param {Joi.Schema} schema
 * @param {object}     [options] - Joi validation option overrides
 * @returns {{ valid: boolean, errors: object|null, value: object|null }}
 */
function validateInput(data, schema, options = {}) {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
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