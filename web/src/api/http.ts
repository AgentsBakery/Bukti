// Real-mode client: fetch (incl. fetch-streamed SSE) / WebSocket exactly per docs/CONTRACT.md.
import { PcmPlayer, startMic, type MicCapture } from '../lib/audio'
import {
  ApiError,
  MicUnavailableError,
  type BuktiApi,
  type InterviewConnection,
  type InterviewHandlers,
  type InterviewOptions,
  type StreamHandlers,
  type Unsubscribe,
} from './client'
import type { Application, AuthConfig, CopilotEvent, InterviewServerMessage, RunEvent, StreamEvent, User } from './types'

// Optional sign-in: when a token provider is set, every /api call carries a fresh Firebase ID token.
let tokenProvider: (() => Promise<string | null>) | null = null

async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenProvider) return {}
  try {
    const t = await tokenProvider()
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(await authHeaders()),
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  return fetch(input, { ...init, headers })
}

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await request(input, init)
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      message = body?.detail ? (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)) : message
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

async function blob(input: string, init?: RequestInit): Promise<Blob> {
  const res = await request(input, init)
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`)
  return res.blob()
}

/**
 * Server-sent events over fetch (EventSource can't send an Authorization header, and the
 * copilot stream is a POST). `onData` returns true when the stream is logically finished.
 */
function streamSSE<T>(url: string, init: RequestInit, onData: (obj: T) => boolean, onTransportError: (message: string) => void): Unsubscribe {
  const ctrl = new AbortController()
  let finished = false
  void (async () => {
    try {
      const res = await request(url, { ...init, headers: { Accept: 'text/event-stream', ...((init.headers as Record<string, string>) ?? {}) }, signal: ctrl.signal })
      if (!res.ok || !res.body) throw new ApiError(res.status, `${res.status} ${res.statusText}`)
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += value.replace(/\r\n/g, '\n')
        let i: number
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const data = block
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).replace(/^ /, ''))
            .join('\n')
          if (!data) continue
          let obj: T
          try {
            obj = JSON.parse(data) as T
          } catch {
            continue
          }
          if (onData(obj)) {
            finished = true
            ctrl.abort()
            return
          }
        }
      }
      if (!finished) onTransportError('The stream ended early')
    } catch (err) {
      if (!finished && !ctrl.signal.aborted) onTransportError(err instanceof Error ? err.message : 'Connection to Bukti was lost')
    }
  })()
  return () => {
    finished = true
    ctrl.abort()
  }
}

function sse(url: string, handlers: StreamHandlers): Unsubscribe {
  return streamSSE<StreamEvent>(
    url,
    { method: 'GET' },
    (event) => {
      handlers.onEvent(event)
      return event.type === 'done' || event.type === 'error'
    },
    (message) => handlers.onTransportError?.(message),
  )
}

function wsUrl(path: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${path}`
}

async function openInterview(
  appId: string,
  lang: string,
  h: InterviewHandlers,
  options?: InterviewOptions,
): Promise<InterviewConnection> {
  // Created inside the user's tap so the AudioContext may start.
  const player = new PcmPlayer(h.onSpeaking)
  player.resume()
  let ws: WebSocket | null = null
  let mic: MicCapture | null = null
  let closed = false

  // Microphone first: the agent shouldn't start talking before the borrower can answer.
  options?.onAskingMic?.()
  try {
    mic = await startMic((frame) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(frame)
    })
  } catch (err) {
    player.close()
    throw new MicUnavailableError(err instanceof Error ? err.message : String(err))
  }

  const sock = new WebSocket(wsUrl(`/ws/interview/${encodeURIComponent(appId)}?lang=${lang}`))
  ws = sock
  sock.binaryType = 'arraybuffer'

  sock.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      player.enqueue(e.data, 24000)
      return
    }
    let msg: InterviewServerMessage
    try {
      msg = JSON.parse(e.data as string)
    } catch {
      return
    }
    switch (msg.type) {
      case 'transcript':
        h.onTranscript?.({ role: msg.role, text: msg.text, final: msg.final })
        break
      case 'fact':
        h.onFact?.(msg.fact)
        break
      case 'interrupted':
        player.flush()
        h.onInterrupted?.()
        break
      case 'done':
        h.onDone?.(msg.facts)
        break
      case 'error':
        h.onError?.(msg.message)
        break
    }
  }
  sock.onclose = () => {
    mic?.stop()
    mic = null
    if (!closed) h.onClose?.()
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('Interview connection timed out')), 10000)
      sock.addEventListener('open', () => {
        window.clearTimeout(t)
        resolve()
      })
      sock.addEventListener('error', () => {
        window.clearTimeout(t)
        reject(new Error('Could not reach the interviewer'))
      })
    })
  } catch (err) {
    mic?.stop()
    player.close()
    throw err
  }
  sock.onerror = () => h.onError?.('Could not reach the interviewer')
  h.onOpen?.()

  return {
    levels: () => ({ agent: player.level(), user: mic ? mic.level() : 0 }),
    setMuted: (m) => mic?.setMuted(m),
    end: () => {
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: 'end' }))
    },
    close: () => {
      closed = true
      mic?.stop()
      mic = null
      player.close()
      if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) sock.close()
    },
  }
}

export function createHttpApi(): BuktiApi {
  const enc = encodeURIComponent
  return {
    mode: 'http',
    health: () => json('/api/health'),
    listPacks: () => json('/api/demo/packs'),
    loadPack: (packId) => json(`/api/demo/packs/${enc(packId)}/load`, { method: 'POST' }),
    createApplication: (body) => json('/api/applications', { method: 'POST', body: JSON.stringify(body) }),
    uploadEvidence: (appId, file, type, filename) => {
      const fd = new FormData()
      fd.append('file', file, filename ?? `${type}.jpg`)
      fd.append('type', type)
      return json(`/api/applications/${enc(appId)}/evidence`, { method: 'POST', body: fd })
    },
    getApplication: (appId) => json<Application>(`/api/applications/${enc(appId)}`),
    listApplications: () => json('/api/applications'),
    extractStream: (appId, handlers) => sse(`/api/applications/${enc(appId)}/extract/stream`, handlers),
    assessStream: (appId, handlers) => sse(`/api/applications/${enc(appId)}/assess/stream`, handlers),
    decide: (appId, body) => json(`/api/applications/${enc(appId)}/decision`, { method: 'POST', body: JSON.stringify(body) }),
    explainAudio: (appId) => blob(`/api/applications/${enc(appId)}/explain-audio`),
    tts: (text, lang) =>
      blob('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) }),
    openInterview,

    authConfig: async () => {
      try {
        return await json<AuthConfig>('/api/auth/config')
      } catch {
        return { enabled: false } // older backend or auth not configured: guest only
      }
    },
    createSession: () => json<User>('/api/auth/session', { method: 'POST' }),
    me: async () => {
      try {
        return await json<User>('/api/me')
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) return null
        throw e
      }
    },
    setTokenProvider: (fn) => {
      tokenProvider = fn
    },

    copilot: (appId, body, onEvent) => {
      let done = false
      const emit = (e: CopilotEvent) => {
        if (done) return
        onEvent(e)
        if (e.type === 'done') done = true
      }
      const stop = streamSSE<CopilotEvent>(
        `/api/applications/${enc(appId)}/copilot`,
        { method: 'POST', body: JSON.stringify(body) },
        (e) => {
          emit(e)
          return e.type === 'done'
        },
        (message) => {
          emit({ type: 'error', message })
          emit({ type: 'done' })
        },
      )
      return () => {
        done = true
        stop()
      }
    },

    listEvents: async (appId) => {
      try {
        return await json<RunEvent[]>(`/api/applications/${enc(appId)}/events`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return []
        throw e
      }
    },
  }
}
