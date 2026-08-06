import { Router } from 'express';
import { validate } from '../../core/middleware/index.js';
import { extractSchema } from './documents.validation.js';
import { postExtract } from './documents.controller.js';

const router = Router();

/** Turn an uploaded PDF, DOCX, or text file into plain text. */
router.post('/extract', validate(extractSchema), postExtract);

export default router;
