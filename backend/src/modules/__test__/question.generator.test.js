/**
 * Tests for the question generator's post-processing.
 *
 * The model output is untrusted: the DB has CHECK constraints on
 * question_type and difficulty_level, so a single off-menu value would fail
 * the whole insert rather than one row.
 */

import { jest } from '@jest/globals';

jest.mock('../ai/ai.service.js', () => ({
  callGemini: jest.fn(),
  parseJsonResponse: jest.fn(),
  questionSchema: { type: 'object' },
}));

import { callGemini, parseJsonResponse, questionSchema } from '../ai/ai.service.js';
import { generateQuestions } from '../ai/generators/question.generator.js';

const JOB = {
  title: 'Backend Engineer',
  company_name: 'Acme',
  job_content: 'Build and scale Node.js services on AWS.',
  key_skills: ['node', 'aws'],
};

const question = (overrides = {}) => ({
  question_text: 'Tell me about a service you scaled.',
  question_type: 'behavioral',
  difficulty_level: 'medium',
  ideal_answer_guidelines: 'Looks for concrete traffic numbers.',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  callGemini.mockResolvedValue('{}');
});

describe('generateQuestions', () => {
  it('constrains decoding with the structured-output schema', async () => {
    parseJsonResponse.mockReturnValue({ questions: [question()] });

    await generateQuestions(JOB, { questionCount: 1 });

    expect(callGemini).toHaveBeenCalledWith(
      expect.objectContaining({ responseSchema: questionSchema })
    );
  });

  it('coerces values the database CHECK constraints would reject', async () => {
    parseJsonResponse.mockReturnValue({
      questions: [question({ question_type: 'Culture Fit', difficulty_level: 'extreme' })],
    });

    const [result] = await generateQuestions(JOB, { questionCount: 1 });

    expect(result.question_type).toBe('general');
    expect(result.difficulty_level).toBe('medium');
  });

  it('accepts valid values in any casing', async () => {
    parseJsonResponse.mockReturnValue({
      questions: [question({ question_type: 'TECHNICAL', difficulty_level: ' Hard ' })],
    });

    const [result] = await generateQuestions(JOB, { questionCount: 1 });

    expect(result.question_type).toBe('technical');
    expect(result.difficulty_level).toBe('hard');
  });

  it('drops near-duplicate questions that differ only by punctuation or case', async () => {
    parseJsonResponse.mockReturnValue({
      questions: [
        question({ question_text: 'Tell me about a service you scaled.' }),
        question({ question_text: 'tell me about a service you scaled!' }),
        question({ question_text: 'How do you approach on-call?' }),
      ],
    });

    const results = await generateQuestions(JOB, { questionCount: 10 });

    expect(results).toHaveLength(2);
    expect(results[1].question_text).toBe('How do you approach on-call?');
  });

  it('never returns more than the requested count', async () => {
    parseJsonResponse.mockReturnValue({
      questions: Array.from({ length: 12 }, (_, i) =>
        question({ question_text: `Question number ${i}` })
      ),
    });

    const results = await generateQuestions(JOB, { questionCount: 5 });

    expect(results).toHaveLength(5);
  });

  it('accepts a bare array as well as the wrapped object', async () => {
    parseJsonResponse.mockReturnValue([question()]);

    const results = await generateQuestions(JOB, { questionCount: 3 });

    expect(results).toHaveLength(1);
  });

  it('throws when every question is blank rather than inserting empties', async () => {
    parseJsonResponse.mockReturnValue({
      questions: [question({ question_text: '   ' }), question({ question_text: '' })],
    });

    await expect(generateQuestions(JOB, { questionCount: 2 })).rejects.toThrow(
      'AI returned no usable questions'
    );
  });

  it('throws when the model returns no question list', async () => {
    parseJsonResponse.mockReturnValue({ questions: [] });

    await expect(generateQuestions(JOB, { questionCount: 2 })).rejects.toThrow(
      'Failed to parse AI question output'
    );
  });
});
