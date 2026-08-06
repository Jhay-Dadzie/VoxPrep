import * as Speech from 'expo-speech'
import type { Panelist } from '@/constants/interviewers'

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
export async function speakQuestion(text: string, member: Panelist | null): Promise<void> {
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

export function stopSpeaking() {
  try {
    Speech.stop()
  } catch {
    /* nothing was speaking */
  }
}

export async function isSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync()
  } catch {
    return false
  }
}
