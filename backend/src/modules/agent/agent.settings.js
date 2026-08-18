import {
  AGENT_AUDIO_ENCODING,
  AGENT_INPUT_SAMPLE_RATE,
  AGENT_LISTEN_MODEL,
  AGENT_OUTPUT_SAMPLE_RATE,
  AGENT_SPEAK_MODEL,
  AGENT_THINK_MODEL,
  AGENT_THINK_PROVIDER,
} from '../../config/deepgram-agent.js';
import { TTS_VOICES } from '../speech/tts.service.js';
import { resolveVoice } from '../interviews/voices.js';
import { buildAgentPrompt, buildGreeting } from './agent.prompt.js';

/**
 * The one configuration message that defines an interview.
 *
 * Sent immediately after the socket opens; Deepgram replies `SettingsApplied`
 * and then starts speaking the greeting. Nothing here can be changed afterwards
 * except the prompt, so anything that varies per interview — persona, source
 * material, voice — has to be decided before the socket is opened.
 */

/**
 * Map a VoxPrep panelist to an Aura voice.
 *
 * Goes through the same roster indirection as the rest of the app: the client
 * sends "m_measured_01", never a vendor model name, so the catalogue can change
 * without an app release.
 */
export const resolveAgentVoice = (voice) => {
  const key = resolveVoice(voice);
  return TTS_VOICES[key]?.deepgram || AGENT_SPEAK_MODEL;
};

/**
 * @param {object} jobData - the session's job description row
 * @param {object} [options]
 * @param {string} [options.mode] - practice mode id
 * @param {string} [options.voice] - panelist voice id
 * @param {number} [options.maxQuestions]
 * @param {string} [options.candidateName]
 */
export const buildAgentSettings = (jobData, { mode, voice, maxQuestions = 15, candidateName } = {}) => ({
  type: 'Settings',
  audio: {
    input: { encoding: AGENT_AUDIO_ENCODING, sample_rate: AGENT_INPUT_SAMPLE_RATE },
    // No container: raw frames, because the client plays them as they arrive and
    // a file header partway through a stream decodes as noise.
    output: { encoding: AGENT_AUDIO_ENCODING, sample_rate: AGENT_OUTPUT_SAMPLE_RATE, container: 'none' },
  },
  agent: {
    language: 'en',
    listen: { provider: { type: 'deepgram', model: AGENT_LISTEN_MODEL } },
    think: {
      provider: { type: AGENT_THINK_PROVIDER, model: AGENT_THINK_MODEL },
      prompt: buildAgentPrompt(jobData, { maxQuestions, mode, candidateName }),
    },
    speak: { provider: { type: 'deepgram', model: resolveAgentVoice(voice) } },
    greeting: buildGreeting(jobData, mode),
  },
});

/**
 * Instruction sent when the question cap is reached.
 *
 * Two messages rather than one. `UpdatePrompt` stops the interviewer asking
 * anything further — without it, it will keep going after the closing line
 * because its standing instructions say to. `InjectAgentMessage` then puts the
 * actual words in its mouth, so the interview ends on a sentence we control
 * rather than whatever the model improvises.
 */
export const buildClosingMessages = (closingRemark) => [
  {
    type: 'UpdatePrompt',
    prompt:
      'The interview is over. Do not ask any further questions. If the candidate speaks again, thank them warmly and say the interview has finished.',
  },
  {
    type: 'InjectAgentMessage',
    content:
      closingRemark ||
      'That covers everything I wanted to ask. Thank you for your time today — you will see your feedback in a moment.',
  },
];

export default { buildAgentSettings, buildClosingMessages, resolveAgentVoice };
