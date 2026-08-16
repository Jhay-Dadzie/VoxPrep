/**
 * Interviewer voice mapping.
 *
 * frontend/constants/interviewers.ts gives each panelist a stable `voiceId`
 * (e.g. "f_warm_01") and expects the server to resolve it to a real TTS voice.
 * That indirection is deliberate: the roster is a product decision, the voice
 * catalogue is a vendor detail, and swapping providers should not require an
 * app release. The move from Deepgram Aura to Gemini was exactly that — this
 * file changed, the client did not.
 *
 * Keys here must stay in sync with the voiceId values in interviewers.ts.
 */

import { GEMINI_VOICES } from '../speech/tts.service.js';

const VOICE_MAP = {
  // Female
  f_warm_01: 'sulafat',     // Dr. Rose-Mary — warm, conversational chair
  f_precise_02: 'erinome',  // Priya Nair — precise domain expert
  f_measured_03: 'kore',    // Elena Rossi — authoritative and calm
  f_bright_04: 'laomedeia', // Nadia Haddad — warm and energetic

  // Male
  m_measured_01: 'iapetus',    // Dr. Benjamin Partey — professional and clear
  m_direct_02: 'alnilam',      // Marcus Bell — deep and direct
  m_calm_03: 'schedar',        // David Okonkwo — neutral external examiner
  m_formal_04: 'rasalgethi',   // Tom Whitfield — measured, formal chair
  m_brisk_05: 'orus',          // Hassan Ali — deep and forceful
  m_even_06: 'algieba',        // Ryan Cole — smooth and natural
};

export const DEFAULT_TTS_VOICE = 'kore';

/**
 * Resolve a caller-supplied voice to a TTS voice key.
 *
 * Accepts either a VoxPrep voiceId ("m_measured_01") or a catalogue key
 * ("orus"), so API consumers that pass voice keys directly keep working.
 * Unknown values fall back to the default rather than erroring - a stale voice
 * id from an older build should still produce audio.
 */
export const resolveVoice = (voice) => {
  if (!voice || typeof voice !== 'string') return DEFAULT_TTS_VOICE;

  const key = voice.trim().toLowerCase();
  if (VOICE_MAP[key]) return VOICE_MAP[key];
  if (GEMINI_VOICES[key]) return key;

  return DEFAULT_TTS_VOICE;
};

export default { resolveVoice, DEFAULT_TTS_VOICE };
