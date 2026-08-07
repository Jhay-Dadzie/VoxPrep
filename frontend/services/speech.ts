import * as Speech from 'expo-speech'
import { createAudioPlayer } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import type { Panelist } from '@/constants/interviewers'
import { speakQuestionRemote } from '@/services/api'

/**
 * Reading questions aloud.
 *
 * On-device rather than a cloud voice, deliberately: it is free, needs no
 * network, and adds no latency to a turn that already waits on transcription.
 * It also cannot run out of quota mid-demo, which cloud TTS can.
 *
 * The trade-off is voice quality — device voices are noticeably synthetic.
 * Swapping in a cloud voice later means changing only this file.
 */

let cachedVoices: Speech.Voice[] | null = null

/**
 * English voices available on this device, cached.
 *
 * Returns an empty list rather than throwing: a device with no voices should
 * fall back to silence, not break the interview.
 */
async function getVoices(): Promise<Speech.Voice[]> {
  if (cachedVoices) return cachedVoices
  try {
    const all = await Speech.getAvailableVoicesAsync()
    const english = all.filter((v) => v.language?.toLowerCase().startsWith('en'))

    // Prefer the two accents these voices are best tuned for. Falling back to
    // any English voice matters on devices that ship neither.
    const preferred = english.filter((v) => /^en[-_](us|gb)/i.test(v.language ?? ''))
    cachedVoices = preferred.length > 0 ? preferred : english
  } catch {
    cachedVoices = []
  }
  return cachedVoices
}

/** Stable index from a voiceId, so a panelist keeps the same voice all session. */
function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/**
 * Name and identifier fragments that signal a voice's gender.
 *
 * The platform exposes no gender field, so this is a heuristic over the names
 * each OS ships. It is only ever used to pick between real voices — never to
 * synthesise a gender by shifting pitch, which is what made the audio warble.
 *
 * "female" contains "male", so the female test must run first.
 */
const FEMALE_HINTS =
  /female|samantha|karen|moira|tessa|fiona|serena|allison|ava|susan|zoe|nicky|joana|kathy|-f-|_f_|#f_|tpf/i
const MALE_HINTS =
  /male|daniel|alex|fred|oliver|thomas|aaron|arthur|gordon|rishi|reed|-m-|_m_|#m_|tpd/i

function voiceGender(voice: Speech.Voice): 'male' | 'female' | null {
  const text = `${voice.name ?? ''} ${voice.identifier ?? ''}`
  if (FEMALE_HINTS.test(text)) return 'female'
  if (MALE_HINTS.test(text)) return 'male'
  return null
}

/**
 * Voice settings for a panelist.
 *
 * Pitch and rate stay at 1.0. Device speech synthesis degrades audibly when
 * pitch-shifted or slowed — it sounds shaky and slurred — so panelists are
 * distinguished by using genuinely different voices instead.
 */
async function settingsFor(member: Panelist | null): Promise<Speech.SpeechOptions> {
  const base: Speech.SpeechOptions = { language: 'en-US', pitch: 1.0, rate: 1.0 }

  if (!member) return base

  const voices = await getVoices()
  if (voices.length === 0) return base

  // Enhanced voices are the downloaded, natural-sounding ones. The compact
  // defaults are what sound robotic, so prefer Enhanced whenever any exist.
  const enhanced = voices.filter((v) => v.quality === Speech.VoiceQuality.Enhanced)
  const pool = enhanced.length > 0 ? enhanced : voices

  const matching = pool.filter((v) => voiceGender(v) === member.gender)
  const finalPool = matching.length > 0 ? matching : pool

  const voice = finalPool[hash(member.voiceId) % finalPool.length]
  return { ...base, voice: voice.identifier }
}

/**
 * Speak a question, resolving once it finishes.
 *
 * Resolves rather than rejects on error: a failed voice should not stop the
 * interview, it should just mean the question is read silently.
 */
/**
 * Audio already fetched and written to disk, keyed by question text.
 *
 * Cloud synthesis takes around five seconds, which is a long silence to sit
 * through before every question. Fetching the next one while the candidate is
 * still answering the current one hides that entirely.
 */
const prefetched = new Map<string, string>()

/** In-flight prefetches, so the same question is never fetched twice. */
const inFlight = new Map<string, Promise<string | null>>()

/**
 * Questions the cloud voice already refused.
 *
 * Without this, a failed fetch is retried on every re-render — which burns
 * quota, floods the server log, and costs the user a five second timeout
 * before device speech takes over each time.
 */
const failed = new Set<string>()

/**
 * Consecutive cloud failures. Past the limit the whole session stops trying
 * and goes straight to device speech.
 *
 * An exhausted daily quota does not recover within a session, so continuing to
 * ask adds a five second silence before every single question.
 */
let consecutiveFailures = 0
const FAILURE_LIMIT = 2

function cloudUnavailable(): boolean {
  return consecutiveFailures >= FAILURE_LIMIT
}

export async function speakQuestion(text: string, member: Panelist | null): Promise<void> {
  // Try the cloud voice first; fall through to the device on any failure.
  if (member && (await speakRemote(text, member))) return
  await speakOnDevice(text, member)
}

/**
 * Fetch a question's audio ahead of time.
 *
 * Fire and forget — the caller does not wait, and a failure simply means the
 * question is synthesised on demand or spoken by the device instead.
 */
export function prefetchQuestion(text: string, member: Panelist | null): void {
  if (!member || !text.trim()) return
  if (prefetched.has(text) || inFlight.has(text)) return
  // Already refused, or the cloud voice has given up for this session.
  if (failed.has(text) || cloudUnavailable()) return

  const task = fetchAudioFile(text, member)
    .then((path) => {
      if (path) prefetched.set(text, path)
      return path
    })
    .catch(() => null)
    .finally(() => inFlight.delete(text))

  inFlight.set(text, task)
}

/** Drop cached audio and its files. Call when a session ends. */
export async function clearPrefetched(): Promise<void> {
  const paths = [...prefetched.values()]
  prefetched.clear()
  inFlight.clear()
  // Reset the breaker: a new session may run after a quota window has rolled
  // over, so it deserves a fresh attempt at the cloud voice.
  failed.clear()
  consecutiveFailures = 0
  await Promise.all(
    paths.map((p) => FileSystem.deleteAsync(p, { idempotent: true }).catch(() => {})),
  )
}

/**
 * Synthesise a question and write it to a local file.
 *
 * Returns null when no cloud voice is available, which the caller reads as
 * "use device speech".
 */
async function fetchAudioFile(text: string, member: Panelist): Promise<string | null> {
  const result = await speakQuestionRemote({
    text,
    panelistVoiceId: member.voiceId,
    gender: member.gender,
  })

  if (!result.available || !result.audioBase64) {
    // Remember the refusal so this question is not asked for again, and count
    // it toward giving up on the cloud voice for the rest of the session.
    failed.add(text)
    consecutiveFailures += 1
    return null
  }

  consecutiveFailures = 0

  // The extension must match the format — providers differ (ElevenLabs returns
  // mp3, Gemini wav) and a mislabelled file fails to play.
  const ext = result.mimeType?.includes('wav') ? 'wav' : 'mp3'
  const path = `${FileSystem.cacheDirectory}q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  await FileSystem.writeAsStringAsync(path, result.audioBase64, {
    encoding: FileSystem.EncodingType.Base64,
  })

  return path
}

/** Currently playing cloud audio, so it can be stopped mid-question. */
let activePlayer: ReturnType<typeof createAudioPlayer> | null = null

/**
 * Fetch and play a natural voice from the server.
 *
 * Returns false whenever anything at all goes wrong — no key, quota exhausted,
 * network down, unplayable audio — so the caller silently uses device speech.
 * The interview must never stall because a voice service is unavailable.
 */
async function speakRemote(text: string, member: Panelist): Promise<boolean> {
  try {
    // Already prefetched, or being prefetched right now — wait on that rather
    // than starting a second identical request.
    let path = prefetched.get(text) ?? null
    if (!path && inFlight.has(text)) {
      path = (await inFlight.get(text)) ?? null
    }

    // Nothing cached, and asking again would just cost another timeout before
    // the device voice takes over anyway.
    if (!path && (failed.has(text) || cloudUnavailable())) return false

    if (!path) {
      path = await fetchAudioFile(text, member)
    }

    if (!path) return false

    // Keep it: Replay Question then costs nothing, and clearPrefetched()
    // removes the file when the session ends.
    prefetched.set(text, path)

    await playFile(path)
    return true
  } catch {
    return false
  }
}

/** Play a local audio file, resolving when it finishes. */
function playFile(uri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let player: ReturnType<typeof createAudioPlayer>
    try {
      player = createAudioPlayer(uri)
    } catch (err) {
      reject(err)
      return
    }

    activePlayer = player
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      activePlayer = null
      try {
        player.remove()
      } catch {
        /* already released */
      }
      resolve()
    }

    player.addListener('playbackStatusUpdate', (status: any) => {
      if (status?.didJustFinish) finish()
    })

    // A question that somehow never reports completion must not hang the
    // interview: cap it well past any realistic question length.
    setTimeout(finish, 60_000)

    player.play()
  })
}

/** The built-in synthesiser. Free, instant, and always available. */
async function speakOnDevice(text: string, member: Panelist | null): Promise<void> {
  const options = await settingsFor(member)

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }

    try {
      Speech.speak(text, {
        ...options,
        onDone: done,
        onStopped: done,
        onError: done,
      })
    } catch {
      done()
    }
  })
}

/** Stops both paths — whichever one happens to be speaking. */
export function stopSpeaking() {
  try {
    Speech.stop()
  } catch {
    /* nothing was speaking */
  }
  try {
    activePlayer?.pause()
    activePlayer?.remove()
  } catch {
    /* already released */
  }
  activePlayer = null
}

export async function isSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync()
  } catch {
    return false
  }
}
