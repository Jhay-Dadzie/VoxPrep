import { Router } from 'express';
import { validate } from '../../core/middleware/index.js';
import {
  generateQuestionsSchema,
  followUpSchema,
  cvAnalysisSchema,
} from './interviews.validation.js';
import {
  postGenerateQuestions,
  postFollowUp,
  postCvAnalysis,
} from './interviews.controller.js';

const router = Router();

/**
 * Generate a question set from supplied source material.
 *
 * Unauthenticated for now — auth lands with the session-persistence work, at
 * which point this moves behind the JWT guard and starts writing rows.
 */
router.post('/questions', validate(generateQuestionsSchema), postGenerateQuestions);

/** Ask whether the answer just given deserves a probe, and get it if so. */
router.post('/follow-up', validate(followUpSchema), postFollowUp);

/** Compare a CV against the role. Run after the interview, never before. */
router.post('/cv-analysis', validate(cvAnalysisSchema), postCvAnalysis);

export default router;
