import Joi from 'joi';

/**
 * POST /api/tts/speak
 *
 * The text is a generated question, so it is bounded — the cap here guards
 * against an oversized request running up a character bill.
 */
export const speakSchema = Joi.object({
  text: Joi.string().trim().min(1).max(600).required(),

  /** The panelist's voiceId from constants/interviewers.ts. */
  panelistVoiceId: Joi.string().trim().max(100).required(),

  gender: Joi.string().valid('male', 'female').required(),
});
