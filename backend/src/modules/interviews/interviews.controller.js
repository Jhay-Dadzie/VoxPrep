import { generateQuestions, generateFollowUp, analyseCv } from './interviews.service.js';
import { isSupabaseConfigured } from '../../config/supabase.js';
import {
  ensureDemoUser,
  createJobDescription,
  createSession,
  insertQuestions,
} from './interviews.repository.js';

/**
 * Express 5 forwards rejected promises to the error middleware, so these
 * handlers deliberately have no try/catch.
 */

/**
 * Generate a question set, and persist it when the database is configured.
 *
 * Persistence is optional on purpose: generation is useful on its own, and
 * being able to bring the two up independently makes each failure obvious.
 * When Supabase is absent the response simply has no sessionId.
 */
export async function postGenerateQuestions(req, res) {
  const { mode, source, secondarySource, count, title } = req.body;

  const questions = await generateQuestions({
    modeId: mode,
    source,
    secondarySource: secondarySource || null,
    count,
  });

  if (!isSupabaseConfigured()) {
    return res.status(200).json({
      success: true,
      persisted: false,
      data: { mode, sessionId: null, count: questions.length, questions },
    });
  }

  const userId = await ensureDemoUser();
  const jobDescriptionId = await createJobDescription({ userId, title, content: source });
  const sessionId = await createSession({
    userId,
    jobDescriptionId,
    title: title || null,
    totalQuestions: questions.length,
    mode,
  });
  const saved = await insertQuestions({ sessionId, questions });

  res.status(200).json({
    success: true,
    persisted: true,
    data: { mode, sessionId, count: saved.length, questions: saved },
  });
}

/**
 * Ask for a follow-up to the answer just given.
 *
 * Always 200. `followUp: null` means the answer needed no probing, which is the
 * normal case — the client moves to the next scripted question either way.
 */
/**
 * Compare the candidate's CV against the role.
 *
 * `matchesRole: true` means no rewrite is warranted and the client should show
 * nothing — the analysis is advice, and unsolicited advice about a CV that is
 * already fine is noise.
 */
export async function postCvAnalysis(req, res) {
  const { mode, source, secondarySource } = req.body;

  const analysis = await analyseCv({ modeId: mode, source, secondarySource });

  res.status(200).json({ success: true, data: analysis });
}

export async function postFollowUp(req, res) {
  const { mode, question, answer } = req.body;

  const followUp = await generateFollowUp({ modeId: mode, question, answer });

  res.status(200).json({
    success: true,
    data: { followUp },
  });
}
