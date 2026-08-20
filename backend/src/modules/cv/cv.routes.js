/**
 * CV Routes
 * Pattern: /api/v1/cv/*
 *
 * All endpoints require a valid JWT (protect middleware). Ownership is
 * additionally enforced in cv.service.js via explicit user_id filters.
 *
 * Endpoints:
 *   POST /cv/sessions/:sessionId/tailor  — upload a CV, get it rewritten for the job
 *   GET  /cv/sessions/:sessionId         — the most recent tailored CV for a session
 *   GET  /cv/:id                         — one tailored CV
 *
 * Route ordering: /sessions/* is registered before the bare /:id route so
 * "sessions" is never read as a CV id.
 */

import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import { uploadCvDocument } from '../../core/middleware/upload.middleware.js';
import { tailorSessionCv, getSessionCv, getCvById } from './cv.controller.js';

const router = Router();

router.use(protect);

router.post('/sessions/:sessionId/tailor', uploadCvDocument, tailorSessionCv);
router.get('/sessions/:sessionId', getSessionCv);
router.get('/:id', getCvById);

export default router;
