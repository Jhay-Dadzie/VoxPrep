// src/modules/interviews/interviewSession.routes.js
import { Router } from 'express';
const router = Router();
import {
  createInterviewSession,
  getInterviewSessions,
  getInterviewSessionById,
  startSession,
  pauseSession,
  continueSession,
  completeSession,
  deleteSession,
  addQuestion,
  submitAnswer
} from './interview.controller.js';
import { protect } from '../auth/auth.middleware.js';

router.use(protect);

// Session CRUD + lifecycle
router.post('/', createInterviewSession);
router.get('/', getInterviewSessions);
router.get('/:id', getInterviewSessionById);
router.post('/:id/start', startSession);
router.post('/:id/pause', pauseSession);
router.post('/:id/continue', continueSession);
router.post('/:id/complete', completeSession);
router.delete('/:id', deleteSession);

// Questions & Answers (manual, no AI)
router.post('/:id/questions', addQuestion);
router.post('/:sessionId/questions/:questionId/answer', submitAnswer);

export default router;