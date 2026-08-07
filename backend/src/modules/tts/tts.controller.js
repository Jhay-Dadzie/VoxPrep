import { speakAs } from './tts.service.js';
import { isTtsConfigured } from '../../config/elevenlabs.js';
import { isGeminiTtsConfigured } from '../../config/gemini-tts.js';

/**
 * Return spoken audio for a question.
 *
 * Always 200. `audio: null` means "unavailable, use the device voice" — not an
 * error. Returning a failure status here would push the client into an error
 * path for something it can handle perfectly well on its own.
 */
export async function postSpeak(req, res) {
  const { text, panelistVoiceId, gender } = req.body;

  const result = await speakAs({ text, panelistVoiceId, gender });

  res.status(200).json({
    success: true,
    data: {
      available: result !== null,
      ...(result ?? {}),
    },
  });
}

/** Lets the app skip the request entirely when no cloud voice is configured. */
export function getStatus(req, res) {
  const elevenlabs = isTtsConfigured();
  const gemini = isGeminiTtsConfigured();

  res.status(200).json({
    success: true,
    data: {
      configured: elevenlabs || gemini,
      providers: { elevenlabs, gemini },
    },
  });
}
