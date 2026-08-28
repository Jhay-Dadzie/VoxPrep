/**
 * Seating a panel, and passing the floor around it.
 *
 * The bug this exists to prevent is a panel that sounds like one person. It has
 * two halves — every seat must resolve to a *different* TTS model, and the
 * rotation must actually reach every seat — and neither is visible until a real
 * interview is running, which is exactly why they are tested here.
 */

import { resolvePanel, speakerIndexForTurn, TURNS_PER_SPEAKER } from '../interviews/panel.js';
import { buildAgentSettings, buildSpeakerMessages } from '../agent/agent.settings.js';
import { buildAgentPrompt } from '../agent/agent.prompt.js';

const ROSTER = [
  { voiceId: 'f_warm_01', name: 'Dr. Rose-Mary', role: 'Chair' },
  { voiceId: 'm_direct_02', name: 'Marcus Bell', role: 'Technical' },
  { voiceId: 'f_precise_02', name: 'Priya Nair', role: 'Domain Expert' },
];

const JOB = {
  title: 'Backend Engineer',
  company_name: 'Acme',
  job_content: 'Build Node.js services.',
  key_skills: ['node'],
};

describe('resolvePanel', () => {
  it('seats the roster the client sent, chair first', () => {
    const panel = resolvePanel(ROSTER, { size: 3 });

    expect(panel.map((seat) => seat.name)).toEqual(['Dr. Rose-Mary', 'Marcus Bell', 'Priya Nair']);
    expect(panel[0].role).toBe('Chair');
  });

  it('gives every seat a different voice', () => {
    const panel = resolvePanel(ROSTER, { size: 3 });
    const models = new Set(panel.map((seat) => seat.model));

    expect(models.size).toBe(3);
  });

  it('recasts a collision rather than letting two seats share a voice', () => {
    // Two stale ids: `resolveVoice` answers both with the default, which would
    // put the same voice in two chairs.
    const panel = resolvePanel(
      [
        { voiceId: 'retired_voice_a', name: 'A', role: 'Chair' },
        { voiceId: 'retired_voice_b', name: 'B', role: 'Technical' },
      ],
      { size: 2 }
    );

    expect(panel[0].model).not.toBe(panel[1].model);
  });

  it('fills the empty seats when an older client sends only a chair', () => {
    const panel = resolvePanel(undefined, { size: 3, voice: 'm_measured_01' });

    expect(panel).toHaveLength(3);
    expect(panel[0].ttsVoice).toBe('iapetus');
    expect(new Set(panel.map((seat) => seat.model)).size).toBe(3);
    // Named rather than "Interviewer 2", because the names are spoken aloud
    // during handovers.
    expect(panel.every((seat) => !/^Interviewer \d$/.test(seat.name))).toBe(true);
  });

  it('never seats more than the mode allows', () => {
    expect(resolvePanel(ROSTER, { size: 1 })).toHaveLength(1);
    expect(resolvePanel(ROSTER, { size: 1 })[0].name).toBe('Dr. Rose-Mary');
  });

  it('always seats someone, even with nothing to go on', () => {
    const panel = resolvePanel(undefined, {});

    expect(panel).toHaveLength(1);
    expect(panel[0].model).toBeTruthy();
  });
});

describe('speakerIndexForTurn', () => {
  it('keeps the chair on the opening turns, then moves round the panel', () => {
    const seats = Array.from({ length: 8 }, (_, turn) => speakerIndexForTurn(turn, 3));

    expect(seats).toEqual([0, 0, 1, 1, 2, 2, 0, 0]);
  });

  it('reaches every seat on a full panel inside the first questions', () => {
    const reached = new Set(
      Array.from({ length: 4 * TURNS_PER_SPEAKER }, (_, turn) => speakerIndexForTurn(turn, 4))
    );

    expect(reached).toEqual(new Set([0, 1, 2, 3]));
  });

  it('never leaves the one interviewer on a one-on-one', () => {
    expect(speakerIndexForTurn(9, 1)).toBe(0);
  });
});

describe('the agent configuration a panel produces', () => {
  it('opens on the chair', () => {
    const panel = resolvePanel(ROSTER, { size: 3 });
    const settings = buildAgentSettings(JOB, { panel, mode: 'job_interview' });

    expect(settings.agent.speak.provider.model).toBe(panel[0].model);
  });

  it('changes voice and brief together when the floor moves', () => {
    const panel = resolvePanel(ROSTER, { size: 3 });
    const prompt = buildAgentPrompt(JOB, { panel, speakerIndex: 1, handover: true });
    const [speak, think] = buildSpeakerMessages(panel, 1, prompt);

    expect(speak).toEqual({
      type: 'UpdateSpeak',
      speak: { provider: { type: 'deepgram', model: panel[1].model } },
    });
    expect(think.type).toBe('UpdatePrompt');
    expect(think.prompt).toContain('RIGHT NOW YOU ARE MARCUS BELL');
  });

  it('tells the incoming speaker to hand over, and only then', () => {
    const panel = resolvePanel(ROSTER, { size: 3 });

    expect(buildAgentPrompt(JOB, { panel, speakerIndex: 1, handover: true })).toMatch(
      /taken over from Dr\. Rose-Mary/
    );
    expect(buildAgentPrompt(JOB, { panel, speakerIndex: 1, handover: false })).toMatch(
      /already have the floor/
    );
  });

  it('says nothing about a panel on a one-on-one', () => {
    const panel = resolvePanel(ROSTER, { size: 1 });

    expect(buildAgentPrompt(JOB, { panel })).not.toMatch(/WHO IS IN THE ROOM/);
  });
});
