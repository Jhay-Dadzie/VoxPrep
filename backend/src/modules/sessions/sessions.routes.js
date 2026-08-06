import { Router } from 'express';
import { getOverview } from './sessions.controller.js';

const router = Router();

/** Stats, recent sessions and score history for the dashboard. */
router.get('/overview', getOverview);

export default router;
