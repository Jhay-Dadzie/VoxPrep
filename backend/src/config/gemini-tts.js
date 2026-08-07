/**
 * Google Gemini text-to-speech.
 *
 * Uses the key already configured for question generation, and — importantly —
 * draws on a separate quota from the chat models, so a day of exhausted LLM
 * calls does not silence the interviewer.
 *
 * Gemini speaks through generateContent with an audio response modality rather
 * than an OpenAI-style /audio/speech endpoint, so it cannot go through the
 * shared client and has its own module.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';

/**
 * Prebuilt voices, split by how they read.
 *
 * Google does not publish a gender field, so this grouping is by ear. It only
 * decides which voice a panelist gets; nothing depends on it being exact.
 */
const VOICES = {
  female: ['Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe'],
  male: ['Puck', 'Charon', 'Fenrir', 'Orus', 'Iapetus'],
};

export function isGeminiTtsConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.GEMINI_TTS_ENABLED !== 'false');
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function pickVoice(panelistVoiceId, gender) {
  const pool = VOICES[gender] ?? VOICES.female;
  return pool[hash(panelistVoiceId) % pool.length];
}

/**
 * Wrap raw PCM in a WAV container.
 *
 * Gemini returns headerless signed 16-bit little-endian PCM
 * (audio/L16;codec=pcm;rate=24000). Players need the 44-byte RIFF header to
 * know the sample rate and bit depth, so without this the audio is unplayable.
 */
function pcmToWav(pcm, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4); // file size minus the first 8 bytes
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** Pull the sample rate out of "audio/L16;codec=pcm;rate=24000". */
function sampleRateFrom(mimeType) {
  const match = /rate=(\d+)/.exec(mimeType ?? '');
  return match ? Number(match[1]) : 24000;
}

/**
 * Synthesise speech, returning playable wav bytes.
 *
 * Throws on failure so the caller can move down the provider chain.
 */
export async function synthesiseWithGemini({ text, panelistVoiceId, gender }) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.GEMINI_TTS_MODEL || DEFAULT_MODEL;
  const voice = pickVoice(panelistVoiceId, gender);

  const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // A short instruction shapes delivery; the model speaks the text itself.
      contents: [{ parts: [{ text: `Say this as a calm, professional interviewer: ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`gemini tts failed (${res.status}) ${detail.slice(0, 200)}`);
  }

  const body = await res.json();
  const inline = body.candidates?.[0]?.content?.parts?.[0]?.inlineData;

  if (!inline?.data) {
    throw new Error('gemini tts returned no audio');
  }

  const pcm = Buffer.from(inline.data, 'base64');
  const wav = pcmToWav(pcm, { sampleRate: sampleRateFrom(inline.mimeType) });

  return { audio: wav, voice, mimeType: 'audio/wav' };
}
