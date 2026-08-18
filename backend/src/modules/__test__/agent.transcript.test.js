import { jest } from '@jest/globals';
import { TranscriptPairer, classifyQuestion } from '../agent/agent.transcript.js';

/**
 * The pairer is the piece that decides what the grader eventually sees, and it
 * runs against a stream nobody can replay. These cases are drawn from a real
 * probe against the live Voice Agent, where one spoken answer arrived as three
 * user messages and one interviewer turn arrived as two assistant messages.
 */

describe('TranscriptPairer', () => {
  it('joins consecutive utterances from the same speaker into one turn', () => {
    const pairer = new TranscriptPairer();

    expect(pairer.add('assistant', "That's a significant improvement.")).toBeNull();
    expect(pairer.add('assistant', 'How did you move the sync layer off the main thread?')).toBeNull();
    expect(pairer.add('user', 'Sure. I led the rebuild of our field service app.')).toBeNull();
    expect(pairer.add('user', 'It had about forty thousand monthly users,')).toBeNull();
    expect(pairer.add('user', 'and I cut cold start from six seconds to under two.')).toBeNull();

    const exchange = pairer.add('assistant', 'What was the hardest part?');

    expect(exchange).toEqual({
      question: "That's a significant improvement. How did you move the sync layer off the main thread?",
      answer:
        'Sure. I led the rebuild of our field service app. It had about forty thousand monthly users, and I cut cold start from six seconds to under two.',
    });
  });

  it('emits one exchange per completed question and answer', () => {
    const pairer = new TranscriptPairer();

    pairer.add('assistant', 'Question one?');
    pairer.add('user', 'Answer one.');
    const first = pairer.add('assistant', 'Question two?');
    pairer.add('user', 'Answer two.');
    const second = pairer.add('assistant', 'Question three?');

    expect(first).toEqual({ question: 'Question one?', answer: 'Answer one.' });
    expect(second).toEqual({ question: 'Question two?', answer: 'Answer two.' });
    expect(pairer.exchanges).toBe(2);
  });

  it('flushes a final answered question when the interview ends', () => {
    const pairer = new TranscriptPairer();

    pairer.add('assistant', 'Last question?');
    pairer.add('user', 'Last answer.');

    expect(pairer.flush()).toEqual({ question: 'Last question?', answer: 'Last answer.' });
  });

  it('does not write a question the candidate never answered', () => {
    const pairer = new TranscriptPairer();

    pairer.add('assistant', 'Question one?');
    pairer.add('user', 'Answer one.');
    // The closing remark: an assistant turn nobody replies to.
    pairer.add('assistant', 'That is all my questions, thank you for your time.');

    // The answered pair came out when the closing remark arrived...
    expect(pairer.exchanges).toBe(1);
    // ...and the unanswered closing remark is not stored as a question.
    expect(pairer.flush()).toBeNull();
  });

  it('carries speech from before the first question into the first answer', () => {
    const pairer = new TranscriptPairer();

    // Someone talking over the greeting.
    pairer.add('user', 'Hello, can you hear me?');
    pairer.add('assistant', 'Yes. Tell me about your background.');
    pairer.add('user', 'I have been building mobile apps for six years.');

    expect(pairer.add('assistant', 'What drew you to mobile?')).toEqual({
      question: 'Yes. Tell me about your background.',
      answer: 'Hello, can you hear me? I have been building mobile apps for six years.',
    });
  });

  it('does not pair early speech with an acknowledgement instead of a question', () => {
    const pairer = new TranscriptPairer();

    pairer.add('user', 'Hello?');
    // A two-sentence interviewer turn: the acknowledgement, then the question.
    expect(pairer.add('assistant', 'Yes, I can hear you.')).toBeNull();
    expect(pairer.add('assistant', 'Tell me about your background.')).toBeNull();

    pairer.add('user', 'Six years in mobile.');

    expect(pairer.add('assistant', 'Which platforms?')).toEqual({
      question: 'Yes, I can hear you. Tell me about your background.',
      answer: 'Hello? Six years in mobile.',
    });
  });

  it('ignores empty and whitespace-only messages', () => {
    const pairer = new TranscriptPairer();

    pairer.add('assistant', 'A question?');
    expect(pairer.add('user', '   ')).toBeNull();
    expect(pairer.add('user', '')).toBeNull();
    expect(pairer.hasUnwrittenAnswer()).toBe(false);
  });
});

describe('classifyQuestion', () => {
  it.each([
    ['Tell me about a time you disagreed with a lead.', 'behavioral'],
    ['Describe a situation where a release went wrong.', 'behavioral'],
    ['What would you do if the build broke on release day?', 'situational'],
    ['How does the reconciler decide what to re-render?', 'technical'],
    ['Explain how you would optimise that query.', 'technical'],
    ['What drew you to this role?', 'general'],
  ])('reads "%s" as %s', (question, expected) => {
    expect(classifyQuestion(question)).toBe(expected);
  });

  it('falls back to general rather than throwing on empty input', () => {
    expect(classifyQuestion()).toBe('general');
    expect(classifyQuestion('')).toBe('general');
  });
});
