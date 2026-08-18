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
 * Clips already fetched this session, keyed by question id.
 *
 * Three callers want the same audio: the screen that warms question 1 while the
 * user is still reading the ready sheet, the session itself when it asks that
 * question, and replay. Without this they would each pay a round trip and the
 * prefetch would buy nothing. Promises rather than URIs, so a second caller
 * arriving mid-flight waits on the first request instead of starting another.
 */
const clipCache = new Map<string, Promise<string>>()

/** One interview's worth, with room to spare. Evicted oldest-first. */
const MAX_CACHED_CLIPS = 20

const trimClipCache = () => {
  while (clipCache.size > MAX_CACHED_CLIPS) {
    const oldest = clipCache.keys().next()
    if (oldest.done) return
    clipCache.delete(oldest.value)
  }
}

/** Sanitised so a question id can never escape the cache directory. */
const safeKey = (key: string) => key.replace(/[^a-zA-Z0-9-_]/g, '')

const fetchClip = async (text: string, voice: string | undefined, key: string): Promise<string> => {
  try {
    const response = await apiClient.post<ArrayBuffer>(
      '/speech/synthesize',
      { text, ...(voice ? { voice } : {}) },
      { responseType: 'arraybuffer', timeout: SYNTHESIZE_TIMEOUT_MS }
    )

    const bytes = new Uint8Array(response.data)
    if (bytes.byteLength === 0) {
      throw new Error('The server returned empty audio')
    }

    const contentType = String(response.headers?.['content-type'] ?? '').split(';')[0].trim()
    const extension = EXTENSION_FOR_TYPE[contentType] ?? 'wav'

    const file = new File(Paths.cache, `voxprep-q-${key}.${extension}`)
    if (file.exists) file.delete()
    file.create()
    file.write(bytes)

    return file.uri
  } catch (error) {
    throw parseApiError(error)
  }
}

/**
 * Fetch spoken audio for a question and write it to the cache directory.
 *
 * Returns a local file:// URI for expo-audio. Cache (not documents) because
 * these are disposable — the OS may reclaim them and the question can always
 * be re-synthesised, which is also why a cache hit is re-checked against the
 * filesystem before it is trusted.
 *
 * The format is read from the response rather than assumed: the server speaks
 * through Deepgram (MP3) and falls back to Gemini (WAV) when it must, and the
 * player decodes by file extension — so guessing wrong here means silence.
 */
export const synthesizeToFile = async (
  text: string,
  options: { voice?: string; cacheKey: string } = { cacheKey: String(Date.now()) }
): Promise<string> => {
  const key = safeKey(options.cacheKey)

  const cached = clipCache.get(key)
  if (cached) {
    try {
      const uri = await cached
      if (new File(uri).exists) return uri
    } catch {
      // A failed fetch must not be remembered as the answer for this question.
    }
    clipCache.delete(key)
  }

  const pending = fetchClip(text, options.voice, key)
  clipCache.set(key, pending)
  // Drop a rejection from the cache without swallowing it for the real caller.
  pending.catch(() => {
    if (clipCache.get(key) === pending) clipCache.delete(key)
  })
  trimClipCache()

  return pending
}

/**
 * Warm the audio for a question that is about to be asked.
 *
 * Fire-and-forget by design: this runs while the user is on another screen, so
 * a failure here must be invisible. The real request happens when the question
 * is asked, and finds the clip already in `clipCache`.
 */
export const prewarmQuestionAudio = (text: string, options: { voice?: string; cacheKey: string }) => {
  synthesizeToFile(text, options).catch(() => {})
}

/**
 * Upload a recording and get back its transcript.
 *
 * Passing sessionId/questionId makes the server persist the audio and the
 * response row itself, which also keeps the session's answered counter in step
 * — so a successful call here is the whole of "submit this answer".
 *
 * `transcript` is the text the device already recognised. Sending it means the
 * stored answer is never briefly replaced by a placeholder if the server's own
 * transcription then fails; when it succeeds, the server's more accurate text
 * wins.
 *
 * A `pending` result means the audio was stored but transcription failed. The
 * answer is not lost; it needs a retry or a typed replacement.
 */
export const transcribeRecording = async (
  audioUri: string,
  context: {
    sessionId: string
    questionId: string
    mimeType?: string
    durationSeconds?: number
    transcript?: string
  }
): Promise<TranscriptionResult> => {
  try {
    const form = new FormData()
    form.append('audio', {
      uri: audioUri,
      // The extension has to match what was recorded or the server's format
      // check rejects it; the recogniser persists WAV on both platforms.
      name: `answer-${context.questionId}.wav`,
      type: context.mimeType ?? 'audio/wav',
    } as any)
    form.append('session_id', context.sessionId)
    form.append('question_id', context.questionId)
    if (context.durationSeconds != null) {
      form.append('duration_seconds', String(Math.round(context.durationSeconds)))
    }
    if (context.transcript) {
      form.append('transcript', context.transcript)
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

/**
 * Attach the recording of an answer that has already been submitted as text.
 *
 * Runs in the background while the conversation carries on, so it must never
 * be awaited on the critical path — the answer is already saved before this is
 * called, and the only thing at stake is the stored audio and a more accurate
 * transcript for grading.
 */
export const attachRecording = async (
  audioUri: string,
  context: {
    sessionId: string
    questionId: string
    transcript: string
    durationSeconds?: number
  }
): Promise<void> => {
  await transcribeRecording(audioUri, context)
}

export const speechService = {
  synthesizeToFile,
  prewarmQuestionAudio,
  transcribeRecording,
  attachRecording,
}
