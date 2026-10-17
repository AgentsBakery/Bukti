// Bidirectional proof linking for the officer console.
// Anything (a memo reason, a check, a metric, a ledger row, a photo highlight) can "point" at
// refs; the viewer, ledger, proof chain and facts all light up whatever those refs resolve to.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Application } from '../api/types'

export interface Resolved {
  entries: Set<string>
  evidence: Set<string>
  facts: Set<string>
  checks: Set<string>
  days: Set<string>
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function resolveRefs(app: Application | null, refs: string[]): Resolved {
  const r: Resolved = { entries: new Set(), evidence: new Set(), facts: new Set(), checks: new Set(), days: new Set() }
  if (!app) return r
  const entryIds = new Set(app.entries.map((e) => e.id))
  const evIds = new Set(app.evidence.map((e) => e.id))
  const factIds = new Set(app.facts.map((f) => f.id))
  const checks = new Map(app.checks.map((c) => [c.id, c]))
  const walk = (ref: string, depth: number) => {
    if (entryIds.has(ref)) r.entries.add(ref)
    else if (evIds.has(ref)) r.evidence.add(ref)
    else if (factIds.has(ref)) r.facts.add(ref)
    else if (checks.has(ref)) {
      if (r.checks.has(ref)) return
      r.checks.add(ref)
      if (depth < 3) for (const x of checks.get(ref)!.evidence_refs) walk(x, depth + 1)
    } else if (DATE.test(ref) || ref.startsWith('day:')) {
      const d = ref.replace('day:', '')
      r.days.add(d)
      for (const e of app.entries) if (e.date === d) r.entries.add(e.id)
    }
  }
  for (const ref of refs) walk(ref, 0)
  return r
}

export function isEmpty(r: Resolved) {
  return !r.entries.size && !r.evidence.size && !r.facts.size && !r.checks.size && !r.days.size
}

type Source = 'memo' | 'photo' | 'ledger' | 'check' | 'metric' | 'fact'

interface LinkCtxValue {
  refs: string[]
  pinned: boolean
  source: Source | null
  resolved: Resolved
  hover: (refs: string[] | null, source?: Source) => void
  pin: (refs: string[], source: Source) => void
  clear: () => void
  /** id of the most recent explicit pin, to trigger scroll/zoom effects */
  pinSeq: number
}

const LinkCtx = createContext<LinkCtxValue | null>(null)

export function LinkProvider({ app, children }: { app: Application | null; children: ReactNode }) {
  const [pinnedRefs, setPinned] = useState<{ refs: string[]; source: Source } | null>(null)
  const [hoverRefs, setHover] = useState<{ refs: string[]; source: Source } | null>(null)
  const [pinSeq, setPinSeq] = useState(0)
  const hoverTimer = useRef<number | null>(null)

  const hover = useCallback((refs: string[] | null, source: Source = 'memo') => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    if (!refs || !refs.length) {
      hoverTimer.current = window.setTimeout(() => setHover(null), 60)
      return
    }
    setHover({ refs, source })
  }, [])
  const pin = useCallback((refs: string[], source: Source) => {
    setPinned((cur) => (cur && cur.refs.join() === refs.join() ? null : { refs, source }))
    setPinSeq((n) => n + 1)
  }, [])
  const clear = useCallback(() => {
    setPinned(null)
    setHover(null)
  }, [])

  const active = hoverRefs ?? pinnedRefs
  const resolved = useMemo(() => resolveRefs(app, active?.refs ?? []), [app, active])
  const value = useMemo<LinkCtxValue>(
    () => ({ refs: active?.refs ?? [], pinned: !hoverRefs && !!pinnedRefs, source: active?.source ?? null, resolved, hover, pin, clear, pinSeq }),
    [active, hoverRefs, pinnedRefs, resolved, hover, pin, clear, pinSeq],
  )
  return <LinkCtx.Provider value={value}>{children}</LinkCtx.Provider>
}

export function useLink() {
  const c = useContext(LinkCtx)
  if (!c) throw new Error('useLink outside LinkProvider')
  return c
}

/** Props to make any element a link source: hover previews, click pins. */
export function useLinkable(refs: string[], source: Source) {
  const { hover, pin } = useLink()
  return {
    onMouseEnter: () => hover(refs, source),
    onMouseLeave: () => hover(null),
    onFocus: () => hover(refs, source),
    onBlur: () => hover(null),
    onClick: () => pin(refs, source),
  }
}
