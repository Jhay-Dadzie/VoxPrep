/**
 * ElevenLabs text-to-speech.
 *
 * Lives server-side so the API key never reaches the app — same rule as the
 * Supabase service key. The client asks this server for audio; it never talks
 * to ElevenLabs directly.
 *
 * Entirely optional. When no key is configured every call reports as
 * unavailable and the app falls back to on-device speech, which is free,
 * instant and cannot run out of quota. A cloud voice that dies mid-demo must
 * degrade to a robotic voice, never to silence.
 */

const BASE_URL = 'https://api.elevenlabs.io/v1';

/**
 * Low latency matters more than maximum fidelity here: the candidate is
 * waiting to be asked a question, not listening to an audiobook.
 */
const MODEL_ID = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

let cachedVoices = null;

export function isTtsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function headers(extra = {}) {
  return { 'xi-api-key': process.env.ELEVENLABS_API_KEY, ...extra };
}

/**
 * The voices available on this account, cached for the process lifetime.
 *
 * Fetched rather than hardcoded: published voice ids change, and a stale
 * constant would fail at demo time with a confusing 404.
 */
export async function listVoices() {
  if (cachedVoices) return cachedVoices;

  const res = await fetch(`${BASE_URL}/voices`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`voice list failed (${res.status})`);
  }

  const body = await res.json();
  cachedVoices = (body.voices ?? []).map((v) => ({
    voiceId: v.voice_id,
    name: v.name,
    // labels.gender is supplied for the pre-made voices and is more reliable
    // than guessing from the name, which is what the device fallback must do.
    gender: v.labels?.gender?.toLowerCase() ?? null,
    accent: v.labels?.accent ?? null,
  }));

  return cachedVoices;
}

/**
 * Synthesise speech, returning mp3 bytes.
 *
 * Throws on any failure so the caller can decide — the route turns that into
 * an "unavailable" response rather than an error, because the client always
 * has a working fallback.
 */
export async function synthesise({ text, voiceId }) {
  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Accept: 'audio/mpeg' }),
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        // Higher stability suits an interviewer: consistent delivery reads as
        // professional, where expressive variation reads as theatrical.
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`synthesis failed (${res.status}) ${detail.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
