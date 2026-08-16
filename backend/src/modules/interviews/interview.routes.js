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
  nextTurn,
  prepareSession,
  retakeSession,
  submitAnswer
} from './interview.controller.js';
import { protect } from '../auth/auth.middleware.js';
import { uploadJobDocument } from '../../core/middleware/upload.middleware.js';

router.use(protect);

// One-shot setup: source material (pasted or uploaded) → session + questions.
// Registered before /:id so "prepare" is never read as a session id.
router.post('/prepare', uploadJobDocument, prepareSession);

// Session CRUD + lifecycle
router.post('/', createInterviewSession);
router.get('/', getInterviewSessions);
router.get('/:id', getInterviewSessionById);
router.post('/:id/start', startSession);
router.post('/:id/pause', pauseSession);
router.post('/:id/continue', continueSession);
router.post('/:id/complete', completeSession);
// Run a finished interview again: a new session on the same source material.
router.post('/:id/retake', retakeSession);
router.delete('/:id', deleteSession);

// The live interview: one call per turn, returning the next question to speak.
router.post('/:id/turn', nextTurn);

// Questions & Answers (bulk AI generation — used outside the live loop)
router.post('/:id/questions', addQuestion);
router.post('/:sessionId/questions/:questionId/answer', submitAnswer);

export default router;
