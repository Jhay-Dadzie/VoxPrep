import { Platform } from 'react-native'
import type { AudioBufferQueueSourceNode, AudioContext, AudioRecorder } from 'react-native-audio-api'
import { getAccessToken } from '@/lib/token-storage'
import { agentSocketUrl } from '@/lib/api-client'
import type { ModeId } from '@/constants/modes'

/**
 * The live voice interview: microphone out, interviewer's voice in, over one
 * socket.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * The previous design was three sequential network round trips per turn —
 * transcribe, then think, then synthesise — and the candidate heard the sum of
 * all three before every question. Deepgram's Voice Agent collapses them into
 * one duplex stream, and the reply is spoken as it is generated rather than
 * after it is finished, so the first word arrives long before the last one is
 * decided.
 *
 * ── Why the audio is raw ────────────────────────────────────────────────────
 *
 * Both directions carry headerless PCM. Anything else would have to be
 * containerised, and a container implies a complete file — which is precisely
 * what a conversation does not have. So the work here is mechanical but
 * unavoidable: the recorder hands out float samples, the wire wants 16-bit
 * integers, and the player wants floats again.
 */

/** What the phone sends up. Matches the server's Settings.audio.input. */
const MIC_SAMPLE_RATE = 16000
/** What the agent sends down. Aura synthesises at 24kHz; resampling would only lose quality. */
const AGENT_SAMPLE_RATE = 24000

/**
 * Mic frame size. 320 samples is 20ms at 16kHz — the same framing used to
 * verify the server end. Small enough that a barge-in is noticed almost
 * immediately, large enough not to spend the turn in bridge crossings.
 */
const MIC_FRAME_SAMPLES = 320

/**
 * Extra silence to keep the microphone closed after the interviewer's audio has
 * drained, on platforms without hardware echo cancellation. Covers the room's
 * own reverb, which arrives after the speaker has stopped.
 */
const ECHO_TAIL_MS = 250

/**
 * Whether the microphone can stay open while the interviewer is speaking.
 *
 * On iOS it can: `voiceChat` mode puts the audio session into voice processing,
 * which cancels the device's own output out of the input, so the candidate can
 * cut in mid-question and the interviewer will not hear itself.
 *
 * On Android there is no equivalent switch exposed here, and an open microphone
 * in front of a loudspeaker means the interviewer transcribes its own voice as
 * the candidate's answer and replies to itself. The interview would derail
 * within two turns. So Android runs half-duplex: the microphone is muted for
 * exactly as long as the interviewer's audio is actually playing. The cost is
 * that you cannot interrupt mid-question; the alternative is an interview that
 * talks to itself, which is not a trade.
 */
const CAN_BARGE_IN = Platform.OS === 'ios'

export type AgentEvent =
  | { type: 'ready'; maxQuestions: number }
  /** The floor has passed to this panelist; their voice speaks from here. */
  | { type: 'speaker'; index: number; voice_id: string; name: string; role: string }
  | { type: 'transcript'; role: 'assistant' | 'user'; content: string }
  | { type: 'user_speaking' }
  | { type: 'agent_done' }
  | { type: 'progress'; asked: number; maxQuestions: number }
  | { type: 'closing'; reason: string }
  | { type: 'done'; reason: string; asked: number }
  | { type: 'error'; message: string }

/** One seat, as the server needs it: who they are and what they sound like. */
export type AgentPanelMember = { voiceId: string; name: string; role: string }

export type AgentConnectionOptions = {
  sessionId: string
  mode?: ModeId
  voice?: string
  /**
   * The panel, chair first.
   *
   * Every seat gets its own voice, and the server rotates between them, so a
   * panel of three sounds like three people rather than one doing all the
   * talking. Sent whole because the names are spoken during handovers.
   */
  panel?: AgentPanelMember[]
  /** How many people the candidate is facing. Derived from `panel` when absent. */
  panelSize?: number
  maxQuestions?: number
  onEvent: (event: AgentEvent) => void
  /** Mic level 0–1 for the waveform, sampled per frame. */
  onLevel?: (level: number) => void
  /** True while the interviewer's voice is coming out of the speaker. */
  onAgentAudio?: (speaking: boolean) => void
}

/** Float samples (-1..1) to the 16-bit little-endian PCM the wire expects. */
const floatToPcm16 = (input: Float32Array): ArrayBuffer => {
  const out = new DataView(new ArrayBuffer(input.length * 2))
  for (let i = 0; i < input.length; i += 1) {
    // Clamped before scaling: a sample above 1.0 would wrap to a large negative
    // value and be heard as a click.
    const clamped = Math.max(-1, Math.min(1, input[i]))
    out.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return out.buffer
}

/** And back again, for the interviewer's voice. */
const pcm16ToFloat = (buffer: ArrayBuffer): Float32Array => {
  const view = new DataView(buffer)
  const count = Math.floor(buffer.byteLength / 2)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 0x8000
  }
  return out
}

/** Peak of a frame, for the waveform. Peak rather than RMS so it reacts visibly. */
const peakLevel = (samples: Float32Array): number => {
  let peak = 0
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i])
    if (value > peak) peak = value
  }
  return Math.min(1, peak * 1.8)
}

export class VoiceAgentConnection {
  private socket: WebSocket | null = null
  private context: AudioContext | null = null
  private queue: AudioBufferQueueSourceNode | null = null
  private recorder: AudioRecorder | null = null
  private audioApi: typeof import('react-native-audio-api') | null = null

  private readonly options: AgentConnectionOptions
  private closed = false
  /** Becomes true only after the gateway has received the authenticated start message. */
  private serverStarted = false
  private micOpen = false

  /**
   * When the interviewer's queued audio is expected to have finished playing.
   *
   * Tracked in wall-clock rather than asked of the player, because the mute
   * window has to cover audio that is still in the queue: the server says
   * "done" when it has finished *sending*, which is well before the device has
   * finished *playing*.
   */
  private agentAudioUntil = 0
  private agentSpeaking = false
  private drainTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: AgentConnectionOptions) {
    this.options = options
  }

  async start(): Promise<void> {
    await this.loadAudioApi()
    await this.prepareAudioSession()
    // Prepare both native audio paths before opening the socket. The agent can
    // send its greeting immediately after the start message, so playback and
    // capture must already be ready when that message is sent.
    this.startPlayback()
    this.startCapture()
    await this.openSocket()
  }

  /**
   * Keep the native-only module out of Expo Router's route-discovery path.
   * Expo Go does not contain this custom native module; a development build
   * does. Loading it only when a voice session starts lets the rest of the app
   * boot and gives the user a useful error in unsupported runtimes.
   */
  private async loadAudioApi() {
    try {
      this.audioApi = await import('react-native-audio-api')
    } catch {
      throw new Error('Live voice interviews require a VoxPrep development build with microphone support.')
    }
    return this.audioApi
  }

  /**
   * Ask the interviewer to sign off.
   *
   * Not the same as hanging up: the server plays a closing line and then closes
   * the socket itself, so the candidate hears the interview end rather than
   * watching it vanish.
   */
  end(): void {
    this.send({ type: 'end' })
  }

  /** Hang up immediately. For leaving the screen, not for finishing. */
  stop(): void {
    if (this.closed) return
    this.closed = true
    this.serverStarted = false

    if (this.drainTimer) clearTimeout(this.drainTimer)

    try {
      this.recorder?.clearOnAudioReady()
      this.recorder?.stop()
    } catch {
      /* never started */
    }

    try {
      this.queue?.stop()
      this.context?.close()
    } catch {
      /* already gone */
    }

    try {
      this.socket?.close()
    } catch {
      /* already gone */
    }

    this.audioApi?.AudioManager.setAudioSessionActivity(false).catch(() => {})
  }

  // ── Audio session ─────────────────────────────────────────────────────────

  private async prepareAudioSession() {
    // `playAndRecord` because both happen at once, `voiceChat` because that is
    // the mode that turns on echo cancellation, and `defaultToSpeaker` because
    // an interview held against the earpiece is inaudible at arm's length.
    const { AudioManager } = this.audioApi!

    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    })

    const permission = await AudioManager.requestRecordingPermissions()
    if (permission !== 'Granted') {
      throw new Error('VoxPrep needs the microphone to hold a spoken interview.')
    }

    await AudioManager.setAudioSessionActivity(true)
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(agentSocketUrl())
      socket.binaryType = 'arraybuffer'
      this.socket = socket

      const failed = (message: string) => reject(new Error(message))

      socket.onopen = async () => {
        const token = await getAccessToken()
        if (!token) {
          failed('Your session has expired. Sign in again.')
          return
        }

        // Credentials go in the first message rather than the URL: query
        // strings end up in access logs, and an access token in a log file is
        // a live credential.
        this.send({
          type: 'start',
          token,
          session_id: this.options.sessionId,
          mode: this.options.mode,
          voice: this.options.voice,
          panel: this.options.panel,
          panel_size: this.options.panelSize ?? this.options.panel?.length,
          max_questions: this.options.maxQuestions,
        })
        this.serverStarted = true
        resolve()
      }

      socket.onmessage = (event) => this.onMessage(event)

      socket.onerror = () => {
        failed('Could not reach the interviewer. Check your connection.')
        this.options.onEvent({ type: 'error', message: 'The connection to the interviewer dropped.' })
      }

      socket.onclose = (event) => {
        if (this.closed) return
        // Application close codes carry a usable reason; a bare 1006 does not.
        if (event.code >= 4000 && event.reason) {
          this.options.onEvent({ type: 'error', message: event.reason })
        }
        this.stop()
      }
    })
  }

  private send(payload: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(payload))
  }

  private onMessage(event: WebSocketMessageEvent) {
    if (typeof event.data !== 'string') {
      this.playAgentAudio(event.data as ArrayBuffer)
      return
    }

    let message: AgentEvent
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    // Barge-in: the candidate has cut in, so anything of the interviewer's reply
    // still queued on this device is now stale and would be talked over.
    if (message.type === 'user_speaking') {
      this.queue?.clearBuffers()
      this.agentAudioUntil = 0
      this.setAgentSpeaking(false)
    }

    this.options.onEvent(message)
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  private startPlayback() {
    const { AudioContext } = this.audioApi!
    this.context = new AudioContext({ sampleRate: AGENT_SAMPLE_RATE })
    this.queue = this.context.createBufferQueueSource()
    this.queue.connect(this.context.destination)
    // react-native-audio-api's queue source defaults its offset to -1, but
    // the native wrapper rejects negative offsets. Passing an explicit zero
    // starts playback immediately and keeps the first streamed frame audible.
    this.queue.start(0, 0)
  }

  /**
   * Enqueue one frame of the interviewer's voice.
   *
   * A queue rather than a scheduled series of one-shot sources: frames arrive
   * every few milliseconds and each one scheduled by hand would need its own
   * start time, which drifts. The queue node keeps them gapless by itself.
   */
  private playAgentAudio(data: ArrayBuffer) {
    if (!this.context || !this.queue || this.closed) return

    const samples = pcm16ToFloat(data)
    if (samples.length === 0) return

    const buffer = this.context.createBuffer(1, samples.length, AGENT_SAMPLE_RATE)
    buffer.copyToChannel(samples, 0)
    this.queue.enqueueBuffer(buffer)

    // Extend the window during which this device is making noise, so the
    // microphone knows to stay shut on platforms that need it to.
    const durationMs = (samples.length / AGENT_SAMPLE_RATE) * 1000
    const now = Date.now()
    this.agentAudioUntil = Math.max(this.agentAudioUntil, now) + durationMs
    this.setAgentSpeaking(true)
    this.scheduleDrainCheck()
  }

  private scheduleDrainCheck() {
    if (this.drainTimer) clearTimeout(this.drainTimer)
    const remaining = Math.max(0, this.agentAudioUntil - Date.now()) + ECHO_TAIL_MS

    this.drainTimer = setTimeout(() => {
      this.drainTimer = null
      if (Date.now() >= this.agentAudioUntil) this.setAgentSpeaking(false)
      else this.scheduleDrainCheck()
    }, remaining)
  }

  private setAgentSpeaking(speaking: boolean) {
    if (this.agentSpeaking === speaking) return
    this.agentSpeaking = speaking
    this.options.onAgentAudio?.(speaking)
  }

  // ── Capture ───────────────────────────────────────────────────────────────

  private startCapture() {
    const { AudioRecorder } = this.audioApi!
    const recorder = new AudioRecorder()
    this.recorder = recorder

    const audioReadyResult = recorder.onAudioReady(
      { sampleRate: MIC_SAMPLE_RATE, bufferLength: MIC_FRAME_SAMPLES, channelCount: 1 },
      (event) => {
        if (this.closed) return

        const samples = event.buffer.getChannelData(0)
        this.options.onLevel?.(peakLevel(samples))

        // Half-duplex on platforms without echo cancellation: while this device
        // is speaking, whatever the microphone hears is mostly this device.
        const muted = !CAN_BARGE_IN && Date.now() < this.agentAudioUntil + ECHO_TAIL_MS
        if (muted) {
          if (this.micOpen) this.micOpen = false
          // Keep sending binary PCM while the speaker is active. Zeroed frames
          // keep Deepgram's input stream alive without sending the interviewer's
          // voice back as candidate speech.
          if (this.serverStarted && this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(new ArrayBuffer(samples.length * 2))
          }
          return
        }
        this.micOpen = true

        if (this.serverStarted && this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(floatToPcm16(samples))
        }
      }
    )

    if (audioReadyResult.status === 'error') {
      throw new Error(`Could not start microphone capture: ${audioReadyResult.message}`)
    }

    recorder.onError(() => {
      this.options.onEvent({ type: 'error', message: 'The microphone stopped working.' })
    })

    const startResult = recorder.start()
    if (startResult.status === 'error') {
      throw new Error(`Could not start microphone capture: ${startResult.message}`)
    }
  }
}

export const voiceAgent = { VoiceAgentConnection, CAN_BARGE_IN }
