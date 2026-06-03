import express from "express";
import { generateSessionQuestionsController } from "./question.controller.js";
import { protect } from '../auth/auth.middleware.js';
const router = express.Router();

router.use(protect);
router.post("/generate", generateSessionQuestionsController);

export default router;