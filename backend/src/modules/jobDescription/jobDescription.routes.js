import { Router } from 'express';
const router = Router();
import { createJobDescription, getJobDescriptions, getJobDescriptionById, updateJobDescription, deleteJobDescription } from './jobDescription.controller.js';
import { protect } from '../auth/auth.middleware.js';
import { uploadJobDocument } from '../../core/middleware/upload.middleware.js';

router.use(protect);

router.post('/', uploadJobDocument, createJobDescription);
router.get('/', getJobDescriptions);
router.get('/:id', getJobDescriptionById);
router.put('/:id', updateJobDescription);
router.delete('/:id', deleteJobDescription);

export default router;