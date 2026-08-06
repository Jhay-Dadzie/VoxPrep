import { Router } from 'express';
import { validate } from '../../core/middleware/index.js';
import { submitAnswerSchema, completeSessionSchema } from './responses.validation.js';
import { postAnswer, postComplete, getResults } from './responses.controller.js';

const router = Router();

/** Submit a spoken answer: transcribe, store, score, and maybe follow up. */
router.post('/', validate(submitAnswerSchema), postAnswer);

/** Mark a session finished and return its full results. */
router.post('/complete', validate(completeSessionSchema), postComplete);

/** Re-read a finished session — used by the results screen and history. */
router.get('/session/:sessionId', getResults);

export default router;
