// One pipeline run per (kind, application), shared by every component that cares.
// Components subscribe and get the events so far replayed, then live events. Runs are
// never cancelled by unmounts: the pipeline should finish even if the screen changes.
import { api } from '../api'
import type { StreamEvent } from '../api/types'

export type StreamKind = 'extract' | 'assess'
type Listener = (e: StreamEvent, replayed: boolean) => void

interface Run {
  events: StreamEvent[]
  listeners: Set<Listener>
  finished: boolean
  failed: string | null
}

const runs = new Map<string, Run>()
const key = (kind: StreamKind, appId: string) => `${kind}:${appId}`

export function startStream(kind: StreamKind, appId: string, opts?: { force?: boolean }): Run {
  const force = opts?.force ?? false
  const k = key(kind, appId)
  const existing = runs.get(k)
  if (existing && !existing.finished) return existing
  if (existing && existing.finished && !existing.failed && !force) return existing
  const run: Run = { events: [], listeners: new Set(), finished: false, failed: null }
  runs.set(k, run)
  const push = (e: StreamEvent) => {
    run.events.push(e)
    if (e.type === 'done') run.finished = true
    if (e.type === 'error') {
      run.finished = true
      run.failed = e.message
    }
    for (const l of run.listeners) l(e, false)
  }
  const handlers = {
    onEvent: push,
    onTransportError: (message: string) => push({ type: 'error', message }),
  }
  if (kind === 'extract') api.extractStream(appId, handlers)
  else api.assessStream(appId, handlers)
  return run
}

export function getStream(kind: StreamKind, appId: string): Run | undefined {
  return runs.get(key(kind, appId))
}

export function subscribeStream(kind: StreamKind, appId: string, listener: Listener): () => void {
  const run = runs.get(key(kind, appId))
  if (!run) return () => {}
  for (const e of run.events) listener(e, true)
  run.listeners.add(listener)
  return () => run.listeners.delete(listener)
}

export function isStreaming(kind: StreamKind, appId: string): boolean {
  const run = runs.get(key(kind, appId))
  return !!run && !run.finished
}
