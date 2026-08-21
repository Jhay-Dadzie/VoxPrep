/**
 * Tests for the exam generator's post-processing.
 *
 * A paper is not partially markable. One question whose correct_option names an
 * option that does not exist would mark a student wrong on a question with no
 * right answer, and they would have no way to tell that is what happened. So the
 * bar here is different from the interview generator's: not "coerce to something
 * legal" but "drop anything that cannot be marked".
 */

import { jest } from '@jest/globals';

jest.mock('../ai/ai.service.js', () => ({
  callGemini: jest.fn(),
  parseJsonResponse: jest.fn(),
  examSchema: { type: 'object' },
}));

import { callGemini, parseJsonResponse, examSchema } from '../ai/ai.service.js';
import { generateExamQuestions } from '../ai/generators/exam.generator.js';

const MATERIAL = {
  title: 'Thermodynamics',
  job_content: 'The first law states that energy is conserved.',
  key_skills: ['enthalpy', 'entropy'],
};

const options = (...texts) =>
  texts.map((text, index) => ({ label: String.fromCharCode(65 + index), text }));

const mcq = (overrides = {}) => ({
  question_text: 'What does the first law of thermodynamics state?',
  options: options('Energy is conserved', 'Entropy falls', 'Heat is work', 'Mass is energy'),
  correct_option: 'A',
  explanation: 'The first law is a statement of energy conservation.',
  topic: 'First law',
  difficulty_level: 'easy',
  ...overrides,
});

/** Feed one batch, then empty ones, so the top-up budget ends the loop. */
const respondOnce = (questions) => {
  parseJsonResponse.mockReturnValueOnce({ questions });
  parseJsonResponse.mockReturnValue({ questions: [] });
};

beforeEach(() => {
  jest.clearAllMocks();
  callGemini.mockResolvedValue('{}');
});

describe('generateExamQuestions', () => {
  it('constrains decoding with the structured-output schema', async () => {
    respondOnce([mcq()]);

    await generateExamQuestions(MATERIAL, { questionCount: 1 });

    expect(callGemini).toHaveBeenCalledWith(
      expect.objectContaining({ responseSchema: examSchema })
    );
  });

  it('keeps the correct answer pointing at the same option text after shuffling', async () => {
    respondOnce([mcq()]);

    const [question] = await generateExamQuestions(MATERIAL, { questionCount: 1 });
    const answer = question.options.find((option) => option.label === question.correct_option);

    expect(answer.text).toBe('Energy is conserved');
    // Re-labelled from A upwards regardless of where the answer landed.
    expect(question.options.map((option) => option.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('does not leave the answer wherever the model put it', async () => {
    // Twenty identical questions: if labels were passed through, every one would
    // answer 'A'. Shuffling makes that outcome vanishingly unlikely.
    respondOnce(
      Array.from({ length: 20 }, (_, index) =>
        mcq({ question_text: `Question number ${index}` })
      )
    );

    const questions = await generateExamQuestions(MATERIAL, { questionCount: 20 });
    const labels = new Set(questions.map((question) => question.correct_option));

    expect(labels.size).toBeGreaterThan(1);
  });

  it('drops a question whose correct option is not one of its options', async () => {
    respondOnce([
      mcq({ question_text: 'Which quantity is a state function?', correct_option: 'E' }),
      mcq(),
    ]);

    const questions = await generateExamQuestions(MATERIAL, { questionCount: 1 });

    expect(questions).toHaveLength(1);
    expect(questions[0].question_text).toMatch(/first law/i);
  });

  it('drops a question with two identical options', async () => {
    respondOnce([
      mcq({
        question_text: 'Which is conserved?',
        options: options('Energy', 'Energy', 'Entropy', 'Volume'),
      }),
    ]);

    await expect(generateExamQuestions(MATERIAL, { questionCount: 10 })).rejects.toThrow(
      /Could not write enough exam questions/i
    );
  });

  it('drops a question that does not carry the requested number of options', async () => {
    respondOnce([mcq({ options: options('Energy is conserved', 'Entropy falls') })]);

    await expect(generateExamQuestions(MATERIAL, { questionCount: 10 })).rejects.toThrow(
      /Could not write enough exam questions/i
    );
  });

  it('drops a question with no explanation to show after marking', async () => {
    respondOnce([mcq({ explanation: '   ' })]);

    await expect(generateExamQuestions(MATERIAL, { questionCount: 10 })).rejects.toThrow(
      /Could not write enough exam questions/i
    );
  });

  it('drops near-duplicates that differ only by punctuation or case', async () => {
    respondOnce([
      mcq({ question_text: 'What does the first law state?' }),
      mcq({ question_text: 'what does the first law state!' }),
      ...Array.from({ length: 10 }, (_, index) =>
        mcq({ question_text: `Distinct question ${index}` })
      ),
    ]);

    const questions = await generateExamQuestions(MATERIAL, { questionCount: 30 });
    const texts = new Set(questions.map((question) => question.question_text.toLowerCase()));

    expect(texts.size).toBe(questions.length);
    expect(questions).toHaveLength(11);
  });

  it('coerces a difficulty the database CHECK constraint would reject', async () => {
    respondOnce([mcq({ difficulty_level: 'brutal' })]);

    const [question] = await generateExamQuestions(MATERIAL, { questionCount: 1 });

    expect(question.difficulty_level).toBe('medium');
  });

  it('never returns more than the requested count', async () => {
    respondOnce(
      Array.from({ length: 12 }, (_, index) => mcq({ question_text: `Question ${index}` }))
    );

    const questions = await generateExamQuestions(MATERIAL, { questionCount: 5 });

    expect(questions).toHaveLength(5);
  });

  it('stops asking for more once a batch adds nothing usable', async () => {
    parseJsonResponse.mockReturnValue({ questions: [] });

    await expect(generateExamQuestions(MATERIAL, { questionCount: 30 })).rejects.toThrow(
      /Could not write enough exam questions/i
    );
    // One batch plus the top-up budget, rather than looping on an empty model.
    expect(callGemini).toHaveBeenCalledTimes(3);
  });

  it('returns a short paper rather than nothing when the material runs thin', async () => {
    respondOnce(
      Array.from({ length: 12 }, (_, index) => mcq({ question_text: `Question ${index}` }))
    );

    const questions = await generateExamQuestions(MATERIAL, { questionCount: 30 });

    expect(questions).toHaveLength(12);
  });
});
