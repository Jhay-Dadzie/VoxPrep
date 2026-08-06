import { AssemblyAI } from 'assemblyai';

/**
 * Speech-to-text client.
 *
 * Lazy, unlike the OpenAI client: question generation and document upload must
 * keep working on a machine where transcription is not configured yet, and
 * importing this module must never be the thing that stops the server booting.
 */

let cached = null;

export function isTranscriptionConfigured() {
  return Boolean(process.env.ASSEMBLYAI_API_KEY);
}

export function getAssemblyAI() {
  if (cached) return cached;

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ASSEMBLYAI_API_KEY environment variable');
  }

  cached = new AssemblyAI({ apiKey });
  return cached;
}
