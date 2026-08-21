import { Router } from 'express';
import {
  prepareExam,
  getExam,
  saveAnswer,
  submitExam,
  getExamResult,
  retakeExam,
} from './exam.controller.js';
import { protect } from '../auth/auth.middleware.js';
import { uploadJobDocument } from '../../core/middleware/upload.middleware.js';

const router = Router();

router.use(protect);

// Source material (pasted or uploaded) → a generated paper.
// Registered before /:sessionId so "prepare" is never read as a session id.
router.post('/prepare', uploadJobDocument, prepareExam);

// Sitting the paper.
router.get('/:sessionId', getExam);
router.put('/:sessionId/answers/:questionId', saveAnswer);

// Marking it, and reading the marks back afterwards.
router.post('/:sessionId/submit', submitExam);
router.get('/:sessionId/result', getExamResult);

// A fresh paper on the same material.
router.post('/:sessionId/retake', retakeExam);

export default router;
