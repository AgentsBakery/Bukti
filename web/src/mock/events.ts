// Mock run log: records the same events the real backend writes to BigQuery `bukti.events`,
// with plausible latencies, token counts and estimated costs.
import type { RunEvent, RunEventType } from '../api/types'
import { randomId, randomInt } from '../lib/random'

const KEY = 'bukti.mock.events.v1'

export const MODELS = { extract: 'gemini-3.8-flash', memo: 'gemini-4-argon', live: 'gemini-3.8-live' }

// Illustrative $/1M tokens for the mock's cost estimate.
const PRICE: Record<string, [number, number]> = {
  [MODELS.extract]: [0.3, 2.5],
  [MODELS.memo]: [1.25, 10],
  [MODELS.live]: [0.5, 2],
}

let log: RunEvent[] = load()

function load(): RunEvent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as RunEvent[]
  } catch {
    return []
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) log = load()
  })
}

let currentUserId: string | null = null
export function setEventUser(uid: string | null) {
  currentUserId = uid
}

const rand = (lo: number, hi: number) => randomInt(Math.round(lo), Math.round(hi))

export function record(
  type: RunEventType,
  app_id: string | null,
  fields: Partial<Omit<RunEvent, 'event_id' | 'ts' | 'type' | 'app_id'>> & { detail: string },
): RunEvent {
  const ev: RunEvent = {
    event_id: `evt_${Date.now().toString(36)}${randomId(4)}`,
    ts: new Date().toISOString(),
    type,
    app_id,
    user_id: currentUserId,
    agent: null,
    model: null,
    tool: null,
    latency_ms: null,
    input_tokens: null,
    output_tokens: null,
    cost_usd: null,
    status: 'ok',
    ...fields,
  }
  log.push(ev)
  try {
    localStorage.setItem(KEY, JSON.stringify(log.slice(-1500)))
  } catch {
    /* quota: keep in memory */
  }
  return ev
}

/** A model call with token counts in the given ranges and a cost derived from them. */
export function recordModel(app_id: string, agent: string, model: string, detail: string, opts: { latency: [number, number]; tin: [number, number]; tout: [number, number] }) {
  const input_tokens = rand(...opts.tin)
  const output_tokens = rand(...opts.tout)
  const [pi, po] = PRICE[model] ?? [0.5, 2]
  return record('model.call', app_id, {
    agent,
    model,
    latency_ms: rand(...opts.latency),
    input_tokens,
    output_tokens,
    cost_usd: Math.round(((input_tokens * pi + output_tokens * po) / 1e6) * 1e6) / 1e6,
    detail,
  })
}

export function recordTool(app_id: string, agent: string, tool: string, detail: string, latency: [number, number] = [8, 60]) {
  return record('tool.call', app_id, { agent, tool, latency_ms: rand(...latency), detail })
}

export function eventsFor(appId: string): RunEvent[] {
  return log.filter((e) => e.app_id === appId)
}
