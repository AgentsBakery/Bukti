import type {
  Application,
  ApplicationSummary,
  DecisionAction,
  DemoPack,
  Evidence,
  EvidenceType,
  Fact,
  Health,
  Lang,
  Market,
  Persona,
  StreamEvent,
} from './types'

/** Cancels a running stream. */
export type Unsubscribe = () => void

export interface StreamHandlers {
  onEvent: (event: StreamEvent) => void
  /** Transport-level failure (connection dropped before `done`). */
  onTransportError?: (message: string) => void
}

export interface InterviewHandlers {
  onOpen?: () => void
  onTranscript?: (t: { role: 'user' | 'agent'; text: string; final: boolean; /** English gloss, when the source offers one */ en?: string }) => void
  onFact?: (fact: Fact) => void
  onInterrupted?: () => void
  onDone?: (facts: Fact[]) => void
  onError?: (message: string) => void
  onClose?: () => void
  /** Agent speech state changed (playback queue non-empty / drained). */
  onSpeaking?: (speaking: boolean) => void
}

export interface InterviewConnection {
  /** Live 0..1 levels for the orb. Polled once per animation frame. */
  levels(): { agent: number; user: number }
  setMuted(muted: boolean): void
  /** Ask the agent to wrap up (`{"type":"end"}`). */
  end(): void
  /** Hard close: stop mic + playback + socket. */
  close(): void
}

export interface InterviewOptions {
  /** Called right before the browser asks for microphone permission. */
  onAskingMic?: () => void
}

export interface BuktiApi {
  readonly mode: 'http' | 'mock'
  health(): Promise<Health>
  listPacks(): Promise<DemoPack[]>
  loadPack(packId: string): Promise<{ application_id: string }>
  createApplication(body: { market: Market; language: Lang; persona?: Persona }): Promise<{ application_id: string }>
  uploadEvidence(appId: string, file: Blob, type: EvidenceType, filename?: string): Promise<Evidence>
  getApplication(appId: string): Promise<Application>
  listApplications(): Promise<ApplicationSummary[]>
  extractStream(appId: string, handlers: StreamHandlers): Unsubscribe
  assessStream(appId: string, handlers: StreamHandlers): Unsubscribe
  decide(appId: string, body: { action: DecisionAction; amount?: number; note?: string }): Promise<Application>
  /** Borrower explanation audio (audio/wav). */
  explainAudio(appId: string): Promise<Blob>
  /** Spoken UI instruction (audio/wav). Rejects when unavailable; callers fall back to speechSynthesis. */
  tts(text: string, lang: Lang): Promise<Blob>
  openInterview(appId: string, lang: Lang, handlers: InterviewHandlers, options?: InterviewOptions): Promise<InterviewConnection>
}

/** Thrown by openInterview when the microphone can't be used (denied, missing, insecure context). */
export class MicUnavailableError extends Error {}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
