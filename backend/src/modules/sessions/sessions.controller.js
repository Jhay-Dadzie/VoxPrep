import { isSupabaseConfigured } from '../../config/supabase.js';
import BadRequestError from '../../core/errors/badRequestError.js';
import { isValidMode, MODE_IDS } from '../interviews/modes.js';
import { ensureDemoUser } from '../interviews/interviews.repository.js';
import { getSessionsForMode, summariseSessions } from './sessions.repository.js';

/**
 * Everything one mode's dashboard renders, in a single request.
 *
 * Scoped to a mode rather than the whole account: job interviews, oral exams
 * and viva rehearsals are scored against different rubrics, so one blended
 * average would not describe anything real.
 */
export async function getOverview(req, res) {
  const mode = req.query.mode;

  if (!isValidMode(mode)) {
    throw new BadRequestError(`mode must be one of: ${MODE_IDS.join(', ')}`);
  }

  if (!isSupabaseConfigured()) {
    // The dashboard is the landing screen; an empty overview beats an error.
    return res.status(200).json({ success: true, data: { mode, ...emptyOverview() } });
  }

  const userId = await ensureDemoUser();
  const sessions = await getSessionsForMode(userId, mode);

  res.status(200).json({
    success: true,
    data: { mode, ...summariseSessions(sessions) },
  });
}

function emptyOverview() {
  return {
    totalSessions: 0,
    completedSessions: 0,
    questionsAnswered: 0,
    averageScore: null,
    bestScore: null,
    lastInterviewDate: null,
    isNewUser: true,
    recent: [],
    history: [],
  };
}
