/**
 * Tests for the setup-time helpers: title derivation from pasted/parsed source
 * material, mode resolution, and interviewer voice mapping.
 */

import { deriveTitle } from '../../core/utils/helpers.js';
import { resolveMode, isValidMode, DEFAULT_MODE, MODE_IDS } from '../interviews/modes.js';
import { resolveVoice, DEFAULT_TTS_VOICE } from '../interviews/voices.js';
import { buildQuestionPrompt } from '../ai/prompts/question.prompt.js';

describe('deriveTitle', () => {
  it('uses the first meaningful line of the source', () => {
    expect(deriveTitle('Senior Backend Engineer\n\nWe are hiring...')).toBe('Senior Backend Engineer');
  });

  it('skips document furniture that a parsed PDF opens with', () => {
    const parsed = 'Job Description\nPage 1\nhttps://acme.example/careers\nStaff Data Scientist\nAbout the role...';
    expect(deriveTitle(parsed)).toBe('Staff Data Scientist');
  });

  it('skips prose lines that are too long to be a heading', () => {
    const text = `${'a'.repeat(200)}\nProduct Manager`;
    expect(deriveTitle(text)).toBe('Product Manager');
  });

  it('collapses internal whitespace from parsed documents', () => {
    expect(deriveTitle('  Senior    QA   Engineer  \nrest')).toBe('Senior QA Engineer');
  });

  it('truncates well inside the column width', () => {
    const long = `${'Engineer '.repeat(30)}\nrest`;
    const result = deriveTitle(long);
    expect(result.length).toBeLessThanOrEqual(120);
  });

  it('falls back when there is nothing usable', () => {
    expect(deriveTitle('')).toBe('Untitled role');
    expect(deriveTitle('Job Description\nPage 2', 'My session')).toBe('My session');
  });
});

describe('resolveMode', () => {
  it('resolves each supported mode', () => {
    MODE_IDS.forEach((id) => {
      expect(resolveMode(id).id).toBe(id);
    });
  });

  it('falls back to the default for an unknown or missing mode', () => {
    expect(resolveMode('telepathy').id).toBe(DEFAULT_MODE);
    expect(resolveMode(undefined).id).toBe(DEFAULT_MODE);
  });

  it('validates mode ids', () => {
    expect(isValidMode('oral_exam')).toBe(true);
    expect(isValidMode('nope')).toBe(false);
    expect(isValidMode(null)).toBe(false);
  });
});

describe('resolveVoice', () => {
  it('maps a VoxPrep panelist voice id to a TTS voice', () => {
    expect(resolveVoice('m_measured_01')).toBe('iapetus');
    expect(resolveVoice('f_warm_01')).toBe('sulafat');
  });

  it('passes a raw catalogue voice key through unchanged', () => {
    expect(resolveVoice('orus')).toBe('orus');
  });

  it('falls back to the default for unknown or missing values', () => {
    expect(resolveVoice('nonexistent_voice')).toBe(DEFAULT_TTS_VOICE);
    expect(resolveVoice(undefined)).toBe(DEFAULT_TTS_VOICE);
    expect(resolveVoice('')).toBe(DEFAULT_TTS_VOICE);
  });
});

describe('buildQuestionPrompt', () => {
  const job = {
    title: 'Backend Engineer',
    company_name: 'Acme',
    job_content: 'Build Node.js services.',
    key_skills: ['node'],
  };

  it('adopts the persona for the requested mode', () => {
    const viva = buildQuestionPrompt(job, { mode: 'viva_defense' })[0].content;
    expect(viva).toMatch(/examination panel/i);

    const exam = buildQuestionPrompt(job, { mode: 'oral_exam' })[0].content;
    expect(exam).toMatch(/examiner/i);
  });

  it('asks for a difficulty spread that adds up to the requested count', () => {
    const content = buildQuestionPrompt(job, { questionCount: 10 })[1].content;
    const [, easy, medium, hard] = content.match(/exactly (\d+) easy, (\d+) medium, (\d+) hard/);

    expect(Number(easy) + Number(medium) + Number(hard)).toBe(10);
  });

  it('caps very long source material so the useful text stays in focus', () => {
    const huge = { ...job, job_content: 'x'.repeat(20000) };
    const content = buildQuestionPrompt(huge)[1].content;

    expect(content).toContain('[content truncated]');
    expect(content.length).toBeLessThan(20000);
  });

  it('leaves normal-length source material intact', () => {
    const content = buildQuestionPrompt(job)[1].content;

    expect(content).toContain('Build Node.js services.');
    expect(content).not.toContain('[content truncated]');
  });
});
