import { listVoices, synthesise, isTtsConfigured } from '../../config/elevenlabs.js';
import { synthesiseWithGemini, isGeminiTtsConfigured } from '../../config/gemini-tts.js';

/**
 * Question audio.
 *
 * Maps a panelist to a real ElevenLabs voice and returns the spoken question.
 * Every failure path returns null rather than throwing: the app falls back to
 * on-device speech, and a missing cloud voice must never stop an interview.
 */

/** Roughly a long question. Guards against a prompt injection running up a bill. */
const MAX_CHARS = 600;

/** voiceId from constants/interviewers.ts -> a voice on this account. */
const assignments = new Map();

/** Stable index so a panelist keeps the same voice for the whole session. */
function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Pick a voice for a panelist, preferring one whose gender matches.
 *
 * Deterministic: the same panelist always resolves to the same voice, so a
 * panel of four sounds like four consistent people rather than a lottery.
 */
async function resolveVoice(panelistVoiceId, gender) {
  if (assignments.has(panelistVoiceId)) return assignments.get(panelistVoiceId);

  const voices = await listVoices();
  if (voices.length === 0) return null;

  const matching = voices.filter((v) => v.gender === gender);
  const pool = matching.length > 0 ? matching : voices;

  const chosen = pool[hash(panelistVoiceId) % pool.length];
  assignments.set(panelistVoiceId, chosen.voiceId);
  return chosen.voiceId;
}

/**
 * Speak a question as a named panelist.
 *
 * Returns null when unavailable — no key, no voices, or the API refused —
 * which the client reads as "use the device voice instead".
 */
export async function speakAs({ text, panelistVoiceId, gender }) {
  const trimmed = text.trim().slice(0, MAX_CHARS);
  if (!trimmed) return null;

  // ElevenLabs if a key is set, otherwise Gemini, otherwise null — which the
  // client reads as "use device speech". Each tier is tried only if the one
  // above is unconfigured or fails, so a spent quota changes how the
  // interviewer sounds rather than whether it speaks.
  if (isTtsConfigured()) {
    try {
      const voiceId = await resolveVoice(panelistVoiceId, gender);
      if (voiceId) {
        const audio = await synthesise({ text: trimmed, voiceId });
        return {
          provider: 'elevenlabs',
          audioBase64: audio.toString('base64'),
          mimeType: 'audio/mpeg',
          voiceId,
          characters: trimmed.length,
        };
      }
    } catch (err) {
      console.error('[tts] elevenlabs unavailable, trying groq:', err.message);
    }
  }

  // Gemini draws on a different quota from its own chat models, so it keeps
  // working on days when question generation has been rate limited.
  if (isGeminiTtsConfigured()) {
    try {
      const { audio, voice, mimeType } = await synthesiseWithGemini({
        text: trimmed,
        panelistVoiceId,
        gender,
      });
      return {
        provider: 'gemini',
        audioBase64: audio.toString('base64'),
        mimeType,
        voiceId: voice,
        characters: trimmed.length,
      };
    } catch (err) {
      console.error('[tts] gemini unavailable, falling back to device:', err.message);
    }
  }

  return null;
}
