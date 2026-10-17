// Real-mode client: fetch / EventSource / WebSocket exactly per docs/CONTRACT.md.
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
import type { Application, InterviewServerMessage, StreamEvent } from './types'

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  })
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
  const res = await fetch(input, init)
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`)
  return res.blob()
}

function sse(url: string, handlers: StreamHandlers): Unsubscribe {
  const es = new EventSource(url)
  let finished = false
  es.onmessage = (msg) => {
    let event: StreamEvent
    try {
      event = JSON.parse(msg.data) as StreamEvent
    } catch {
      return
    }
    handlers.onEvent(event)
    if (event.type === 'done' || event.type === 'error') {
      finished = true
      es.close()
    }
  }
  es.onerror = () => {
    // EventSource auto-reconnects, which would re-run the pipeline. Never let it.
    es.close()
    if (!finished) handlers.onTransportError?.('Connection to Bukti was lost')
    finished = true
  }
  return () => {
    finished = true
    es.close()
  }
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
  }
}
