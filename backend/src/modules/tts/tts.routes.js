import { Router } from 'express';
import { validate } from '../../core/middleware/index.js';
import { speakSchema } from './tts.validation.js';
import { postSpeak, getStatus } from './tts.controller.js';

const router = Router();

/** Is a cloud voice configured at all? */
router.get('/status', getStatus);

/** Speak a question as a named panelist. Returns audio, or null to fall back. */
router.post('/speak', validate(speakSchema), postSpeak);

export default router;
