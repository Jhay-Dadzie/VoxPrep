import { File, Paths } from 'expo-file-system'
import apiClient from '@/lib/api-client'
import type { TranscribeApiResponse, TranscriptionResult } from '@/types/interview'
import { parseApiError } from './error-handler'

/**
 * Speech I/O for a live session.
 *
 * Both calls go through apiClient rather than bare fetch so a token that
 * expires mid-interview is refreshed and the request retried, instead of
 * dropping the user's answer.
 */

const SYNTHESIZE_TIMEOUT_MS = 30_000
/** Transcription is a provider round-trip and a long answer is a big upload. */
const TRANSCRIBE_TIMEOUT_MS = 120_000

/** Player-readable extension for whatever the speech endpoint returned. */
const EXTENSION_FOR_TYPE: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
}

/**
 * Fetch spoken audio for a question and write it to the cache directory.
 *
 * Returns a local file:// URI for expo-audio. Cache (not documents) because
 * these are disposable — the OS may reclaim them and the question can always
 * be re-synthesised.
 *
 * The format is read from the response rather than assumed: the server speaks
 * through Gemini (WAV) and falls back to Deepgram (MP3) when it must, and the
 * player decodes by file extension — so guessing wrong here means silence.
 */
export const synthesizeToFile = async (
  text: string,
  options: { voice?: string; cacheKey: string } = { cacheKey: String(Date.now()) }
): Promise<string> => {
  try {
    const response = await apiClient.post<ArrayBuffer>(
      '/speech/synthesize',
      { text, ...(options.voice ? { voice: options.voice } : {}) },
      { responseType: 'arraybuffer', timeout: SYNTHESIZE_TIMEOUT_MS }
    )

    const bytes = new Uint8Array(response.data)
    if (bytes.byteLength === 0) {
      throw new Error('The server returned empty audio')
    }

    const contentType = String(response.headers?.['content-type'] ?? '').split(';')[0].trim()
    const extension = EXTENSION_FOR_TYPE[contentType] ?? 'wav'

    // Sanitised so a question id can never escape the cache directory.
    const safeKey = options.cacheKey.replace(/[^a-zA-Z0-9-_]/g, '')
    const file = new File(Paths.cache, `voxprep-q-${safeKey}.${extension}`)
    if (file.exists) file.delete()
    file.create()
    file.write(bytes)

    return file.uri
  } catch (error) {
    throw parseApiError(error)
  }
}

/**
 * Upload a recording and get back its transcript.
 *
 * Passing sessionId/questionId makes the server persist the audio and the
 * response row itself, which also keeps the session's answered counter in step
 * — so a successful call here is the whole of "submit this answer".
 *
 * `durationSeconds` is sent as a fallback only — the server prefers the
 * duration the transcription provider measures from the audio itself.
 *
 * A `pending` result means the audio was stored but transcription failed. The
 * answer is not lost; it needs a retry or a typed replacement.
 */
export const transcribeRecording = async (
  audioUri: string,
  context: { sessionId: string; questionId: string; mimeType?: string; durationSeconds?: number }
): Promise<TranscriptionResult> => {
  try {
    const form = new FormData()
    form.append('audio', {
      uri: audioUri,
      // The extension has to match the recorder's output or the server's
      // format check rejects it; expo-audio writes .m4a on both platforms.
      name: `answer-${context.questionId}.m4a`,
      type: context.mimeType ?? 'audio/m4a',
    } as any)
    form.append('session_id', context.sessionId)
    form.append('question_id', context.questionId)
    if (context.durationSeconds != null) {
      form.append('duration_seconds', String(Math.round(context.durationSeconds)))
    }

    const response = await apiClient.post<TranscribeApiResponse>('/speech/transcribe', form, {
      timeout: TRANSCRIBE_TIMEOUT_MS,
    })

    const { status, data } = response.data
    const transcript = data.transcript?.trim() ?? ''

    return {
      transcript,
      confidence: data.confidence,
      durationSeconds: data.duration,
      pending: status === 'partial' || transcript.length === 0,
    }
  } catch (error) {
    throw parseApiError(error)
  }
}

export const speechService = { synthesizeToFile, transcribeRecording }
