import BadRequestError from '../../core/errors/badRequestError.js';
import { isTranscriptionConfigured } from '../../config/assemblyai.js';
import {
  transcribeAnswer,
  scoreAnswer,
  deliveryStats,
  summariseSession,
} from './responses.service.js';
import { generateFollowUp } from '../interviews/interviews.service.js';
import {
  getQuestionContext,
  saveResponse,
  saveFeedback,
  insertFollowUpQuestion,
  completeSession,
  getSessionResults,
} from './responses.repository.js';

/**
 * Submit a spoken answer.
 *
 * The order matters: transcribe, save, then score. Saving before scoring means
 * a scoring failure costs the feedback, not the answer — the recording is gone
 * once the client drops it, so persisting the transcript first is the only
 * point of no return worth protecting.
 */
export async function postAnswer(req, res) {
  const { questionId, mode, base64, mimeType, durationSeconds } = req.body;

  if (!isTranscriptionConfigured()) {
    throw new BadRequestError('Transcription is not configured on the server.');
  }

  const context = await getQuestionContext(questionId);

  const transcript = await transcribeAnswer({ base64, mimeType });

  if (!transcript.text) {
    // Silence is a user event, not a server error: nothing was said.
    return res.status(200).json({
      success: true,
      data: { transcript: null, silent: true, responseId: null, feedback: null, followUp: null },
    });
  }

  const seconds = transcript.durationSeconds ?? durationSeconds ?? null;

  const responseId = await saveResponse({
    questionId,
    sessionId: context.sessionId,
    userId: context.userId,
    transcribedText: transcript.text,
    durationSeconds: seconds,
    confidence: transcript.confidence,
  });

  // Only the follow-up is awaited: it decides what gets asked next, so the
  // interview cannot continue without it. Scoring is not on that path.
  //
  // These also run one at a time rather than concurrently — two simultaneous
  // calls trip the free-tier rate limit and one comes back 503.
  // A follow-up never earns another follow-up. Real interviewers press a point
  // once and move on, and without this the chain has no natural end — a vague
  // candidate could be probed indefinitely.
  const followUp = context.isFollowUp
    ? null
    : await generateFollowUp({
        modeId: mode,
        question: context.question,
        answer: transcript.text,
      });

  // Persisted immediately so it has an id. A follow-up that only exists in the
  // client cannot have its own answer attached to anything.
  let savedFollowUp = null;
  if (followUp) {
    try {
      savedFollowUp = await insertFollowUpQuestion({
        sessionId: context.sessionId,
        followUp,
      });
    } catch (err) {
      // Better to skip the follow-up than to ask a question whose answer
      // cannot be recorded.
      console.error('[responses] could not persist follow-up', err.message);
    }
  }

  // Scored in the background while the candidate answers the next question.
  // Waiting for it would add tens of seconds to every turn, and nothing on
  // screen needs it until the results page.
  scoreAnswer({
    modeId: mode,
    question: context.question,
    answer: transcript.text,
    source: context.source,
  })
    .then((scores) => {
      if (!scores) return null;
      return saveFeedback({ responseId, sessionId: context.sessionId, questionId, scores });
    })
    .catch((err) => {
      // Already logged in the service; feedback is simply absent from results.
      console.error('[responses] background scoring failed', err.message);
    });

  res.status(200).json({
    success: true,
    data: {
      responseId,
      silent: false,
      transcript: {
        text: transcript.text,
        confidence: transcript.confidence,
        durationSeconds: seconds,
      },
      delivery: deliveryStats({ text: transcript.text, durationSeconds: seconds }),
      // Arrives later; the results screen reads it from the database.
      feedback: null,
      // Null unless it was saved — the client must never ask a question it
      // cannot record an answer for.
      followUp: savedFollowUp,
    },
  });
}

export async function postComplete(req, res) {
  const { sessionId, durationSeconds } = req.body;

  await completeSession({ sessionId, durationSeconds });
  const row = await getSessionResults(sessionId);

  res.status(200).json({ success: true, data: summariseSession(row) });
}

export async function getResults(req, res) {
  const row = await getSessionResults(req.params.sessionId);
  res.status(200).json({ success: true, data: summariseSession(row) });
}
