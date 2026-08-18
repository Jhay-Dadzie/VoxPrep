/**
 * Turning a live conversation back into question/answer rows.
 *
 * The database, the history screen and the grader all assume one question paired
 * with one answer. A voice conversation does not arrive that way. Deepgram emits
 * `ConversationText` per *utterance*, so one spoken answer routinely arrives as
 * three separate user messages, and the interviewer's acknowledgement and its
 * actual question arrive as two separate assistant messages:
 *
 *   assistant  "That's a significant improvement."
 *   assistant  "How did you move the sync layer off the main thread?"
 *   user       "Sure. I led the rebuild of our field service app."
 *   user       "It had about forty thousand monthly users,"
 *   user       "and I cut cold start from six seconds to under two."
 *
 * Writing a row per message would produce five fragments where the grader
 * expects one exchange. So consecutive messages from the same speaker are joined
 * into a turn, and a completed exchange is only emitted when the speaker changes
 * back — the point at which both halves are known to be whole.
 *
 * Deliberately pure: no database, no socket. This is the part most likely to be
 * wrong, so it is the part that has to be testable on its own.
 */

export class TranscriptPairer {
  constructor() {
    /** Assistant text waiting for the answer that will complete it. */
    this.pendingQuestion = [];
    /** Candidate text accumulating against the pending question. */
    this.pendingAnswer = [];
    /**
     * Candidate speech from before anything had been asked — someone talking
     * over the greeting, usually "hello, can you hear me?".
     *
     * Held separately rather than in `pendingAnswer`, because an answer that
     * exists before a question does not mean an exchange is complete. Treating
     * it as one pairs the candidate's "hello" with the interviewer's *first*
     * sentence, which on a two-sentence turn is the acknowledgement rather than
     * the question — an exchange that never happened. It is carried into the
     * first real answer instead: discarding what a candidate said is never the
     * safer default.
     */
    this.preamble = [];
    this.exchanges = 0;
  }

  /**
   * Feed one `ConversationText` message.
   *
   * @param {'assistant'|'user'} role
   * @param {string} content
   * @returns {{question: string, answer: string}|null} a completed exchange, if
   *   this message closed one off
   */
  add(role, content) {
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return null;

    if (role === 'user') {
      if (this.pendingQuestion.length === 0) this.preamble.push(text);
      else this.pendingAnswer.push(text);
      return null;
    }

    if (role !== 'assistant') return null;

    // The interviewer speaking again after an answer closes the previous
    // exchange: both halves are now complete.
    if (this.pendingAnswer.length > 0) {
      const exchange = this.take();
      this.pendingQuestion = [text];
      return exchange;
    }

    this.pendingQuestion.push(text);
    return null;
  }

  /** Pull the open exchange out, folding in anything said before it started. */
  take() {
    const answer = [...this.preamble, ...this.pendingAnswer].join(' ');
    const question = this.pendingQuestion.join(' ');

    this.preamble = [];
    this.pendingQuestion = [];
    this.pendingAnswer = [];
    this.exchanges += 1;

    return { question, answer };
  }

  /**
   * Close off whatever is still open, at the end of the interview.
   *
   * An answered question is emitted. A question with no answer is not: the
   * closing remark is an assistant turn nobody replies to, and a question row
   * with a null answer reads downstream as "the recording failed" — which would
   * be a lie about the candidate's performance.
   */
  flush() {
    if (this.pendingQuestion.length > 0 && this.pendingAnswer.length > 0) {
      return this.take();
    }

    this.preamble = [];
    this.pendingQuestion = [];
    this.pendingAnswer = [];
    return null;
  }

  /** True when the candidate has said something not yet written down. */
  hasUnwrittenAnswer() {
    return this.pendingAnswer.length > 0;
  }
}

/**
 * Guess a question's type from how it is worded.
 *
 * The schema wants a type on every question and the agent, unlike the
 * turn-by-turn model it replaces, returns no metadata — it just talks. The
 * alternatives were a second model call per question, which reintroduces exactly
 * the latency this architecture exists to remove, or storing everything as
 * "general", which would quietly flatten the type mix the grader reports on.
 * A keyword pass is a weaker signal than either, and an honest one: it only has
 * to be right often enough for the breakdown to mean something.
 */
export const classifyQuestion = (question = '') => {
  const text = question.toLowerCase();

  if (/\b(tell me about a time|describe a (?:time|situation)|give me an example|walk me through a time|have you ever)\b/.test(text)) {
    return 'behavioral';
  }
  if (/\b(what would you do|how would you handle|imagine|suppose|if you were|hypothetical)\b/.test(text)) {
    return 'situational';
  }
  if (/\b(how does|how do you|explain|implement|design|architect|debug|optimi[sz]e|why does|what is the difference|trade-?off)\b/.test(text)) {
    return 'technical';
  }
  return 'general';
};

export default { TranscriptPairer, classifyQuestion };
