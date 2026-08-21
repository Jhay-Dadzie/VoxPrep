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
 * @param {number} [options.panelSize] - how many people the candidate faces
 * @param {number} [options.maxQuestions]
 * @param {string} [options.candidateName]
 */
export const buildAgentSettings = (
  jobData,
  { mode, voice, panelSize, maxQuestions = 15, candidateName } = {}
) => ({
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
      prompt: buildAgentPrompt(jobData, { maxQuestions, mode, panelSize, candidateName }),
    },
    speak: { provider: { type: 'deepgram', model: resolveAgentVoice(voice) } },
    greeting: buildGreeting(jobData, mode),
  },
});

/**
 * How the interviewer signs off, per reason for ending.
 *
 * An interview that stops dead the moment the last answer lands reads as a
 * dropped call, so every ending gets a spoken hand-off. The wording differs
 * because the reasons do: being cut short by the candidate is not the same
 * event as running out of questions, and one line covering both sounds wrong
 * for at least one of them.
 *
 * The cap line opens by conceding the turn ("that's everything I wanted to
 * cover") because it is usually spoken right after the interviewer has already
 * started asking one more question — the last exchange is only recognised as
 * complete when the interviewer speaks again. Bridging is what makes that land
 * as a decision rather than an interruption.
 */
const CLOSING_REMARKS = {
  limit:
    "Actually, that's everything I wanted to cover, so let's leave it there. " +
    "Thank you for walking me through all of that today — you'll see your feedback in just a moment.",
  ended_early:
    "Of course, let's wrap up there. Thank you for your time today — " +
    "you'll see your feedback on what we covered in just a moment.",
  idle:
    "That feels like a natural place to finish. Thank you for your time today — " +
    "you'll see your feedback in just a moment.",
  time_limit:
    "We're coming up on time, so let's finish there. Thank you for talking me through all of that — " +
    "you'll see your feedback in just a moment.",
};

const DEFAULT_CLOSING_REMARK =
  'That covers everything I wanted to ask. Thank you for your time today — ' +
  'you will see your feedback in a moment.';

export const closingRemarkFor = (reason) => CLOSING_REMARKS[reason] || DEFAULT_CLOSING_REMARK;

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
    content: closingRemark || DEFAULT_CLOSING_REMARK,
  },
];

export default { buildAgentSettings, buildClosingMessages, closingRemarkFor, resolveAgentVoice };
