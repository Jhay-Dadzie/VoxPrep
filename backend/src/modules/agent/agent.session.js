import WebSocket from 'ws';
import {
  AGENT_ENDPOINT,
  AGENT_IDLE_TIMEOUT_MS,
  AGENT_MAX_SESSION_MS,
} from '../../config/deepgram-agent.js';
import { info, warn, error as logError } from '../../core/errors/logger.js';
import { addQuestionToSession, completeSession, submitAnswer } from '../interviews/interview.service.js';
import { speakerIndexForTurn } from '../interviews/panel.js';
import {
  buildAgentSettings,
  buildClosingMessages,
  buildSpeakerMessages,
  closingRemarkFor,
} from './agent.settings.js';
import { buildAgentPrompt } from './agent.prompt.js';
import { TranscriptPairer, classifyQuestion } from './agent.transcript.js';

/**
 * One live interview, bridging the phone to Deepgram's Voice Agent.
 *
 * ── Why the audio goes through this server at all ───────────────────────────
 *
 * The phone could talk to Deepgram directly and save a hop. It does not, for two
 * reasons. First, that requires a credential on the device: either the account
 * key, which must never ship in an app bundle, or a short-lived token, which
 * this project's Deepgram key has no permission to mint (`/v1/auth/grant`
 * returns 403 — the key is a restricted one). Second, and more importantly,
 * something has to write the interview down. Only this server holds the Supabase
 * credentials, and a transcript that exists solely on the phone is one dropped
 * connection away from an interview the candidate can never be graded on.
 *
 * The hop costs one round trip to this server per audio frame. Against a
 * measured ~2.4s from end-of-speech to the agent's reply, that is noise.
 *
 * ── What "writing it down" means here ───────────────────────────────────────
 *
 * Rows are written as the conversation happens, not at the end. A candidate who
 * loses signal at question nine keeps nine graded answers instead of none.
 *
 * ── Who is speaking ─────────────────────────────────────────────────────────
 *
 * A panel is several people and has to sound like several people, but the agent
 * synthesises one voice at a time. So the panel runs as a rotation held here:
 * between turns — never during one — the floor passes to the next panelist, and
 * both halves of that have to move together. `UpdateSpeak` changes what the
 * candidate hears; `UpdatePrompt` tells the model who it has become, without
 * which the new voice picks up the previous panelist's thread.
 *
 * The handover point is `AgentAudioDone`: the interviewer has stopped talking
 * and the candidate has not started, which is the one window in a turn where
 * changing the configuration cannot clip anybody.
 */

/** Frames the client sends us are raw PCM; anything text is a control message. */
const isControlMessage = (data, isBinary) => !isBinary;

export class AgentSession {
  /**
   * @param {object} deps
   * @param {import('ws').WebSocket} deps.client - socket to the phone
   * @param {string} deps.sessionId
   * @param {string} deps.userId
   * @param {object} deps.jobData - the session's job description row
   * @param {object} [deps.options] - mode, panel, voice, maxQuestions, candidateName
   */
  constructor({ client, sessionId, userId, jobData, options = {} }) {
    this.client = client;
    this.sessionId = sessionId;
    this.userId = userId;
    this.jobData = jobData;
    this.options = options;
    this.maxQuestions = options.maxQuestions || 15;

    /** The seated panel, chair first. One entry for a one-on-one. */
    this.panel = Array.isArray(options.panel) ? options.panel : [];
    /** Which seat currently holds the floor. */
    this.speakerIndex = 0;
    /** Agent turns spoken so far; the rotation is a function of this. */
    this.agentTurns = 0;
    /**
     * True while the current speaker's brief still tells them to introduce
     * themselves. Cleared after their first turn, so a panelist who holds the
     * floor for a second question does not say hello twice.
     */
    this.handoverPending = false;

    this.upstream = null;
    this.pairer = new TranscriptPairer();
    this.askedCount = 0;
    this.closing = false;
    /** Set once the sign-off has actually been spoken — see onUpstreamMessage. */
    this.closingSpoken = false;
    this.finished = false;
    this.startedAt = Date.now();

    /**
     * Writes are queued rather than awaited inline. Supabase inserts take
     * hundreds of milliseconds and the agent does not wait for us; blocking the
     * message handler on a write would stall the audio relay behind the
     * database, which the candidate would hear as a stutter.
     */
    this.writeQueue = Promise.resolve();

    this.idleTimer = null;
    this.maxTimer = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) {
      this.failClient('Voice interviews are not configured on this server.');
      return;
    }

    this.upstream = new WebSocket(AGENT_ENDPOINT, ['token', key]);

    this.upstream.on('open', () => this.onUpstreamOpen());
    this.upstream.on('message', (data, isBinary) => this.onUpstreamMessage(data, isBinary));
    this.upstream.on('error', (err) => {
      logError('Voice agent upstream error:', err);
      this.failClient('The interviewer connection dropped. Your answers so far are saved.');
    });
    this.upstream.on('close', () => this.finish('upstream_closed'));

    this.client.on('message', (data, isBinary) => this.onClientMessage(data, isBinary));
    this.client.on('close', () => this.finish('client_closed'));
    this.client.on('error', () => this.finish('client_error'));

    this.resetIdleTimer();
    this.maxTimer = setTimeout(() => this.beginClosing('time_limit'), AGENT_MAX_SESSION_MS);
  }

  onUpstreamOpen() {
    this.upstream.send(
      JSON.stringify(
        buildAgentSettings(this.jobData, {
          mode: this.options.mode,
          panel: this.panel,
          voice: this.options.voice,
          maxQuestions: this.maxQuestions,
          candidateName: this.options.candidateName,
        })
      )
    );
  }

  // ── Phone → Deepgram ──────────────────────────────────────────────────────

  onClientMessage(data, isBinary) {
    if (isControlMessage(data, isBinary)) {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      // The candidate tapped End. Close through the agent so they hear a
      // sign-off rather than the call simply vanishing.
      if (msg.type === 'end') this.beginClosing('ended_early');
      return;
    }

    this.resetIdleTimer();
    if (this.upstream?.readyState === WebSocket.OPEN && !this.closing) {
      this.upstream.send(data, { binary: true });
    }
  }

  // ── Deepgram → phone ──────────────────────────────────────────────────────

  onUpstreamMessage(data, isBinary) {
    if (isBinary) {
      // The agent's voice. Straight through — every millisecond spent here is
      // heard as a gap in the middle of a sentence.
      this.sendAudio(data);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'SettingsApplied':
        this.sendEvent({ type: 'ready', maxQuestions: this.maxQuestions });
        // The chair opens. Told to the phone as well as configured upstream, so
        // the screen shows the face the candidate is about to hear.
        this.announceSpeaker();
        break;

      case 'ConversationText':
        this.onConversationText(msg.role, msg.content);
        break;

      case 'UserStartedSpeaking':
        // Barge-in: the candidate has cut in, so whatever of the agent's reply
        // is already queued on the device must be dropped or they will be
        // talking over a sentence that is no longer relevant.
        this.sendEvent({ type: 'user_speaking' });
        break;

      case 'AgentAudioDone':
        this.sendEvent({ type: 'agent_done' });
        // Hang up only once the sign-off itself has finished playing.
        //
        // Not merely "we are closing": an exchange is only recognised as
        // complete when the interviewer speaks again, so hitting the question
        // cap means it has already started asking one more. That question's
        // AgentAudioDone lands before the injected farewell has even been
        // synthesised, and ending on it cut the sign-off off entirely — the
        // call simply stopped after a question nobody was going to answer.
        if (this.closing && this.closingSpoken) this.finish('closed');
        else this.advanceSpeaker();
        break;

      case 'Error':
        warn(`Voice agent error: ${msg.description || msg.message || 'unknown'}`);
        this.failClient('The interviewer ran into a problem. Your answers so far are saved.');
        break;

      default:
        // Welcome, History, LatencyReport and friends: useful upstream, noise
        // to the phone.
        break;
    }
  }

  /**
   * A completed exchange means a question the candidate actually answered.
   * Both halves are written together so the pair can never come apart.
   */
  onConversationText(role, content) {
    this.sendEvent({ type: 'transcript', role, content });

    // Once the interview is closing, the only interviewer turn left is the
    // sign-off we injected. Noting that it has been said is what lets
    // AgentAudioDone tell the farewell's end-of-audio from that of the
    // question the agent was already part-way through.
    //
    // Nothing is paired from here on. The farewell is not a question and the
    // candidate's "thanks, bye" is not an answer; written down as an exchange
    // it becomes an extra question the grader is then asked to score, which it
    // can only do badly.
    if (this.closing) {
      if (role === 'assistant') this.closingSpoken = true;
      return;
    }

    const exchange = this.pairer.add(role, content);
    if (!exchange) return;

    this.askedCount += 1;
    this.sendEvent({ type: 'progress', asked: this.askedCount, maxQuestions: this.maxQuestions });
    this.persistExchange(exchange);

    if (this.askedCount >= this.maxQuestions) this.beginClosing('limit');
  }

  persistExchange({ question, answer }) {
    this.writeQueue = this.writeQueue
      .then(async () => {
        const row = await addQuestionToSession(this.sessionId, this.userId, {
          question_text: question,
          question_type: classifyQuestion(question),
          difficulty_level: 'medium',
          ideal_answer_guidelines: null,
        });

        await submitAnswer(this.sessionId, row.id, this.userId, { answer_text: answer });
      })
      .catch((err) => {
        // A failed write must not take the interview down with it. The
        // conversation is still happening and the remaining answers are still
        // worth having.
        logError('Could not store an interview exchange:', err);
      });
  }

  // ── Who has the floor ─────────────────────────────────────────────────────

  /**
   * Called once the interviewer has finished speaking a turn.
   *
   * Two things can happen. The rotation moves on, and the next panelist is
   * briefed and given a voice. Or it does not, and the outgoing brief — which
   * told the current speaker to introduce themselves — is replaced with one that
   * does not, so their second question is not a second hello.
   */
  advanceSpeaker() {
    if (this.closing || this.finished || this.panel.length <= 1) return;

    this.agentTurns += 1;
    const next = speakerIndexForTurn(this.agentTurns, this.panel.length);

    if (next !== this.speakerIndex) {
      this.setSpeaker(next, true);
      return;
    }

    if (this.handoverPending) this.setSpeaker(this.speakerIndex, false);
  }

  /**
   * Hand the floor to a seat.
   *
   * @param {number} index
   * @param {boolean} handover - whether the incoming speaker should announce
   *   themselves; false when only the brief is being refreshed
   */
  setSpeaker(index, handover) {
    const changed = index !== this.speakerIndex;
    this.speakerIndex = index;
    this.handoverPending = handover;

    if (this.upstream?.readyState !== WebSocket.OPEN) return;

    const prompt = buildAgentPrompt(this.jobData, {
      maxQuestions: this.maxQuestions,
      mode: this.options.mode,
      panel: this.panel,
      speakerIndex: index,
      handover,
      candidateName: this.options.candidateName,
    });

    for (const message of buildSpeakerMessages(this.panel, index, prompt)) {
      this.upstream.send(JSON.stringify(message));
    }

    if (changed) this.announceSpeaker();
  }

  /** Tell the phone whose face and name to show. */
  announceSpeaker() {
    const speaker = this.panel[this.speakerIndex];
    if (!speaker) return;

    this.sendEvent({
      type: 'speaker',
      index: this.speakerIndex,
      voice_id: speaker.voiceId,
      name: speaker.name,
      role: speaker.role,
    });
  }

  // ── Ending ────────────────────────────────────────────────────────────────

  /**
   * Ask the interviewer to sign off, then wait for it to finish speaking.
   *
   * Not the same as hanging up: cutting the socket the moment the cap is hit
   * would clip the agent mid-sentence, and the candidate would be left unsure
   * whether the interview ended or broke.
   */
  beginClosing(reason) {
    if (this.closing || this.finished) return;
    this.closing = true;

    info(`Voice interview ${this.sessionId} closing (${reason})`);
    this.sendEvent({ type: 'closing', reason });

    if (this.upstream?.readyState === WebSocket.OPEN) {
      // The chair closes an interview, whoever asked the last question. Only
      // the voice is changed — the closing messages carry their own prompt.
      const chair = this.panel[0];
      if (chair && this.speakerIndex !== 0) {
        this.speakerIndex = 0;
        this.upstream.send(
          JSON.stringify({
            type: 'UpdateSpeak',
            speak: { provider: { type: 'deepgram', model: chair.model } },
          })
        );
        this.announceSpeaker();
      }

      for (const message of buildClosingMessages(closingRemarkFor(reason))) {
        this.upstream.send(JSON.stringify(message));
      }
      // Backstop: if the sign-off never plays — the injection is refused, or
      // its audio never arrives — the interview still ends rather than hanging
      // on a `closingSpoken` that will never be set.
      setTimeout(() => this.finish('closing_timeout'), 15_000);
      return;
    }

    this.finish(reason);
  }

  async finish(reason) {
    if (this.finished) return;
    this.finished = true;

    clearTimeout(this.idleTimer);
    clearTimeout(this.maxTimer);

    // Anything the candidate said after the last question still counts.
    const trailing = this.pairer.flush();
    if (trailing) {
      this.askedCount += 1;
      this.persistExchange(trailing);
    }

    try {
      this.upstream?.close();
    } catch {
      /* already gone */
    }

    // Every queued write has to land before the session is marked complete,
    // or grading runs against a transcript that is still being written.
    try {
      await this.writeQueue;
    } catch {
      /* individual failures are already logged */
    }

    try {
      await completeSession(this.sessionId, this.userId);
    } catch (err) {
      // Already complete, or the status flip failed. The answers are stored
      // either way, and history reconciles the counters.
      warn(`Could not complete session ${this.sessionId}: ${err.message}`);
    }

    info(`Voice interview ${this.sessionId} finished (${reason}) with ${this.askedCount} exchanges`);
    this.sendEvent({ type: 'done', reason, asked: this.askedCount });

    try {
      this.client.close();
    } catch {
      /* already gone */
    }
  }

  resetIdleTimer() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.beginClosing('idle'), AGENT_IDLE_TIMEOUT_MS);
  }

  // ── Talking to the phone ──────────────────────────────────────────────────

  sendEvent(payload) {
    if (this.client.readyState !== WebSocket.OPEN) return;
    this.client.send(JSON.stringify(payload));
  }

  sendAudio(chunk) {
    if (this.client.readyState !== WebSocket.OPEN) return;
    this.client.send(chunk, { binary: true });
  }

  failClient(message) {
    this.sendEvent({ type: 'error', message });
    this.finish('error');
  }
}

export default { AgentSession };
