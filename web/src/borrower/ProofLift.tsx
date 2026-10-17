import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Application, BBox, Entry, Evidence, StatementDay, StreamEvent } from '../api/types'
import { centerIn, flyNumber } from '../lib/flight'
import { figure } from '../lib/format'
import { bboxStyle, prefersReducedMotion } from '../lib/hooks'
import { subscribeStream } from '../lib/streams'
import { useBorrower } from './context'
import { dayMatch, LedgerBook } from './LedgerBook'
import { Check, FileText, NotebookPen } from 'lucide-react'

export interface LiftSummary {
  lines: number
  pages: number
  matched: number
  days: number
}

function railAmountBox(b: BBox): BBox {
  // The statement row's money column sits in its right ~40%.
  return [b[0], b[1] + (b[3] - b[1]) * 0.6, b[2], b[1] + (b[3] - b[1]) * 0.78]
}

export function summarise(entries: Entry[], days: Map<string, StatementDay>): LiftSummary {
  const sales = new Map<string, number>()
  for (const e of entries) sales.set(e.date, (sales.get(e.date) ?? 0) + e.amount_in)
  let matched = 0
  for (const [date, d] of days) if (dayMatch(sales.get(date) ?? 0, d) === 'ok') matched++
  return { lines: entries.length, pages: new Set(entries.map((e) => e.evidence_id)).size, matched, days: days.size }
}

export function ProofLift({
  app,
  live,
  onFinished,
  onError,
}: {
  app: Application
  live: boolean
  onFinished?: (s: LiftSummary) => void
  onError?: (message: string) => void
}) {
  const { t, rail } = useBorrower()
  const rootRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [entries, setEntries] = useState<Entry[]>(() => (live ? [] : app.entries))
  const [days, setDays] = useState<Map<string, StatementDay>>(() => new Map(live ? [] : app.statement.map((d) => [d.date, d])))
  const [landed, setLanded] = useState<Set<string>>(() =>
    live ? new Set() : new Set([...app.entries.map((e) => e.id), ...app.statement.map((d) => `day:${d.date}`)]),
  )
  const [animated, setAnimated] = useState<Set<string>>(() => new Set())
  const [scanning, setScanning] = useState<string | null>(null)
  const ledgerEvidence = app.evidence.filter((e) => e.type === 'ledger')
  const [viewEv, setViewEv] = useState<string | null>(() => ledgerEvidence[0]?.id ?? app.evidence[0]?.id ?? null)
  const [focus, setFocus] = useState<{ kind: 'entry' | 'day'; id: string } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [phase, setPhase] = useState<'reading' | 'done' | 'error'>(live ? 'reading' : 'done')
  const [size, setSize] = useState({ w: 0, h: 0 })
  const scannedSet = useRef(new Set<string>())
  const [scanned, setScanned] = useState<Set<string>>(() => new Set())

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const land = useCallback((key: string) => {
    setLanded((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  const launch = useCallback(
    (kind: 'entry' | 'day', id: string, text: string, tone: 'in' | 'out' | 'rail', quick: boolean, thread = !quick) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const root = rootRef.current
          const list = listRef.current
          const key = kind === 'entry' ? id : `day:${id}`
          if (!root || !list || !layerRef.current) return land(key)
          const row = root.querySelector<HTMLElement>(kind === 'entry' ? `[data-row="${id}"]` : `[data-date="${id}"]`)
          if (row) centerIn(list, row)
          window.setTimeout(
            () => {
              const src = root.querySelector(`[data-src="${key}"]`)
              const dst = root.querySelector(kind === 'entry' ? `[data-amt="${id}"]` : `[data-rail="${id}"]`)
              if (!src || !dst || !layerRef.current) return land(key)
              flyNumber({ layer: layerRef.current, from: src, to: dst, text, tone, duration: quick ? 620 : 860, onLand: () => land(key), thread })
            },
            prefersReducedMotion() ? 0 : quick ? 200 : 380,
          )
        }),
      )
    },
    [land],
  )

  // ---- event pacing ------------------------------------------------------
  // The real extractor delivers a whole page of lines at once. Every live event goes through
  // a queue so each number gets its own moment: slow for the first few (so the eye learns the
  // gesture), then brisk, then faster still if a backlog builds up.
  const queue = useRef<StreamEvent[]>([])
  const timer = useRef<number | null>(null)
  const liveCount = useRef(0)
  const curEv = useRef<string | null>(null)
  const anyLine = useRef(false)
  const [waiting, setWaiting] = useState<string[]>([])

  const view = (id: string) => {
    curEv.current = id
    setScanning(id)
    setViewEv(id)
  }

  const apply = useCallback(
    (e: StreamEvent, replayed: boolean): number => {
      switch (e.type) {
        case 'evidence_scan': {
          scannedSet.current.add(e.evidence_id)
          setScanned(new Set(scannedSet.current))
          setWaiting((w) => (w.includes(e.evidence_id) ? w : [...w, e.evidence_id]))
          if (!curEv.current) {
            view(e.evidence_id)
            setFocus(null)
            return replayed ? 0 : 1100
          }
          return 0
        }
        case 'entry': {
          const en = e.entry
          if (!replayed && curEv.current !== en.evidence_id && anyLine.current) {
            // new page: establishing shot first, then the lines
            view(en.evidence_id)
            setFocus(null)
            queue.current.unshift(e)
            return 950
          }
          anyLine.current = true
          if (curEv.current !== en.evidence_id) view(en.evidence_id)
          setEntries((prev) => (prev.some((x) => x.id === en.id) ? prev : [...prev, en]))
          setFocus({ kind: 'entry', id: en.id })
          if (replayed) {
            land(en.id)
            return 0
          }
          const n = liveCount.current++
          const backlog = queue.current.length
          const pace = n < 3 ? 1000 : n < 6 ? 580 : backlog > 14 ? 175 : 245
          setAnimated((prev) => new Set(prev).add(en.id))
          const isIn = en.amount_in > 0
          launch('entry', en.id, `${isIn ? '' : '−'}${figure(isIn ? en.amount_in : en.amount_out, app.market)}`, isIn ? 'in' : 'out', pace < 500, pace >= 500 || n % 3 === 0)
          return pace
        }
        case 'statement_day': {
          const d = e.day
          if (!replayed && curEv.current !== d.evidence_id) {
            view(d.evidence_id)
            setFocus(null)
            queue.current.unshift(e)
            return 1000
          }
          setDays((prev) => new Map(prev).set(d.date, d))
          setFocus({ kind: 'day', id: d.date })
          if (replayed) {
            land(`day:${d.date}`)
            return 0
          }
          setAnimated((prev) => new Set(prev).add(`day:${d.date}`))
          launch('day', d.date, d.transactions === 0 ? '—' : figure(d.total, app.market), 'rail', true, false)
          return queue.current.length > 10 ? 120 : 160
        }
        case 'error':
          setPhase('error')
          onError?.(e.message)
          return 0
        case 'done': {
          setPhase('done')
          setScanning(null)
          setFocus(null)
          setWaiting([])
          const ents = e.application.entries
          const ds = new Map(e.application.statement.map((d) => [d.date, d]))
          setEntries(ents)
          setDays(ds)
          window.setTimeout(() => {
            setLanded(new Set([...ents.map((x) => x.id), ...[...ds.keys()].map((k) => `day:${k}`)]))
            const first = e.application.evidence.find((x) => x.type === 'ledger')
            if (first) setViewEv(first.id)
          }, replayed ? 0 : 900)
          onFinished?.(summarise(ents, ds))
          return 0
        }
        default:
          return 0
      }
    },
    [app.market, land, launch, onError, onFinished],
  )

  const pump = useCallback(() => {
    if (timer.current !== null) return
    const step = () => {
      const e = queue.current.shift()
      if (!e) {
        timer.current = null
        return
      }
      const delay = apply(e, false)
      timer.current = window.setTimeout(step, prefersReducedMotion() ? Math.min(delay, 60) : delay)
    }
    timer.current = window.setTimeout(step, 0)
  }, [apply])

  useEffect(() => {
    if (!live) return
    const off = subscribeStream('extract', app.id, (e, replayed) => {
      if (replayed) apply(e, true)
      else {
        queue.current.push(e)
        pump()
      }
    })
    return () => {
      off()
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [live, app.id, apply, pump])

  // While the model reads pages in parallel, let the camera drift between them.
  useEffect(() => {
    if (phase !== 'reading' || waiting.length < 2) return
    const iv = window.setInterval(() => {
      if (anyLine.current) return
      const i = waiting.indexOf(curEv.current ?? '')
      view(waiting[(i + 1) % waiting.length])
    }, 3400)
    return () => window.clearInterval(iv)
  }, [phase, waiting])

  // ---- camera ------------------------------------------------------------
  const ev: Evidence | undefined = app.evidence.find((x) => x.id === viewEv)
  const entriesHere = useMemo(() => entries.filter((x) => x.evidence_id === viewEv), [entries, viewEv])
  const daysHere = useMemo(() => [...days.values()].filter((d) => d.evidence_id === viewEv && d.bbox), [days, viewEv])
  const selEntry = selected ? entries.find((x) => x.id === selected) : undefined
  let focusBox: BBox | null = null
  if (selEntry && selEntry.evidence_id === viewEv) focusBox = selEntry.row_bbox ?? selEntry.bbox
  else if (phase === 'reading' && focus?.kind === 'entry') {
    const f = entries.find((x) => x.id === focus.id)
    if (f && f.evidence_id === viewEv) focusBox = f.row_bbox ?? f.bbox
  } else if (phase === 'reading' && focus?.kind === 'day') {
    const d = days.get(focus.id)
    if (d?.bbox && d.evidence_id === viewEv) focusBox = d.bbox
  }
  const aspect = ev ? ev.height / ev.width : 4 / 3
  const W = size.w
  const H = size.h
  const imgH = W * aspect
  let transform = 'none'
  if (W && H) {
    if (focusBox) {
      const cy = ((focusBox[0] + focusBox[2]) / 2000) * imgH
      const ty = Math.max(H - imgH, Math.min(0, H * 0.42 - cy))
      transform = `translate(0px, ${ty}px) scale(1)`
    } else {
      const s = Math.min(1, H / imgH)
      transform = `translate(${(W - W * s) / 2}px, ${(H - imgH * s) / 2}px) scale(${s})`
    }
  }
  const scanBox = focusBox && phase === 'reading' ? focusBox : null

  const select = (id: string, fromPhoto = false) => {
    const en = entries.find((x) => x.id === id)
    if (!en) return
    setSelected((cur) => (cur === id && !fromPhoto ? null : id))
    setViewEv(en.evidence_id)
    if (fromPhoto && listRef.current) {
      const row = rootRef.current?.querySelector<HTMLElement>(`[data-row="${id}"]`)
      if (row) centerIn(listRef.current, row, true)
    }
  }

  const tabs = app.evidence.filter((x) => x.type === 'ledger' || x.type === 'statement')
  const pageNo = (x: Evidence) => ledgerEvidence.findIndex((l) => l.id === x.id) + 1
  const scanningEv = app.evidence.find((x) => x.id === scanning)
  const progress =
    phase === 'reading'
      ? scanningEv?.type === 'ledger'
        ? t('readingPage', { n: pageNo(scanningEv) })
        : scanningEv?.type === 'statement'
          ? t('readingStatement')
          : scanningEv
            ? t('readingOther')
            : t('readingPage', { n: 1 })
      : t('tapLine')

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 flex-col">
      {/* Stage: the photo, with the camera following the reading */}
      <div className="shrink-0 px-4 pt-3">
        <div
          ref={stageRef}
          className="kraft relative overflow-hidden rounded-[18px] shadow-[inset_0_2px_10px_rgb(60_40_10/0.35)]"
          style={{ height: phase === 'done' ? 'clamp(190px, 30cqh, 320px)' : 'clamp(210px, 41cqh, 400px)', transition: 'height .7s var(--ease-ink)' }}
        >
          {ev ? (
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ width: W, height: imgH, transform, transition: 'transform 0.85s var(--ease-ink)' }}
            >
              <AnimatePresence initial={false}>
                <motion.img
                  key={ev.id}
                  src={ev.url}
                  alt={ev.label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45 }}
                  className="absolute inset-0 h-full w-full rounded-[3px] object-fill shadow-[0_8px_24px_-6px_rgb(0_0_0/0.5)]"
                  draggable={false}
                />
              </AnimatePresence>
              {/* highlights */}
              {entriesHere.map((en) => {
                const box = en.row_bbox ?? en.bbox
                const fresh = animated.has(en.id)
                const isSel = selected === en.id
                return (
                  <div key={en.id}>
                    <motion.button
                      type="button"
                      tabIndex={phase === 'done' ? 0 : -1}
                      aria-label={en.description}
                      data-hl={en.id}
                      onClick={() => select(en.id, true)}
                      className="hl block cursor-pointer"
                      style={{ ...bboxStyle(box, 3), animation: isSel ? 'hl-pulse 1.1s ease-in-out infinite' : undefined }}
                      initial={fresh ? { scaleX: 0 } : false}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.42, ease: [0.3, 0.7, 0.2, 1] }}
                    />
                    <div data-src={en.id} aria-hidden style={bboxStyle(en.bbox)} className="pointer-events-none" />
                  </div>
                )
              })}
              {daysHere.map((d) => (
                <div key={d.date}>
                  <motion.div
                    className="hl pointer-events-none"
                    style={{ ...bboxStyle(d.bbox!, 2), opacity: 0.4 }}
                    initial={animated.has(`day:${d.date}`) ? { scaleX: 0 } : false}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                  <div data-src={`day:${d.date}`} aria-hidden style={bboxStyle(railAmountBox(d.bbox!))} className="pointer-events-none" />
                </div>
              ))}
              {/* ink circle around the amount being read / selected */}
              <AnimatePresence>
                {(() => {
                  const target = selEntry && selEntry.evidence_id === viewEv ? selEntry : phase === 'reading' && focus?.kind === 'entry' ? entries.find((x) => x.id === focus.id && x.evidence_id === viewEv) : undefined
                  if (!target) return null
                  return (
                    <motion.svg
                      key={target.id}
                      viewBox="0 0 100 40"
                      preserveAspectRatio="none"
                      className="pointer-events-none overflow-visible"
                      style={bboxStyle(target.bbox, 9)}
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.4 } }}
                    >
                      <motion.path
                        d="M 8 22 C 6 6, 70 2, 92 12 C 102 18, 96 36, 60 37 C 28 39, 3 34, 6 20 C 8 12, 20 8, 34 7"
                        fill="none"
                        stroke="var(--color-ink)"
                        strokeWidth={2.2}
                        vectorEffect="non-scaling-stroke"
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                      />
                    </motion.svg>
                  )
                })()}
              </AnimatePresence>
              {/* ink scan-line */}
              {scanning && scanning === viewEv ? (
                scanBox ? (
                  <div className="scanline" style={{ top: `${scanBox[2] / 10 + 0.6}%`, transition: 'top 0.32s var(--ease-ink)' }} />
                ) : (
                  <div className="scanline animate-sweep" />
                )
              ) : null}
            </div>
          ) : null}

          {/* evidence tabs */}
          <div className="absolute left-2 right-2 top-2 flex gap-1.5" role="tablist" aria-label="Evidence">
            {tabs.map((x) => {
              const isView = x.id === viewEv
              const isScan = x.id === scanning
              const read = entries.some((en) => en.evidence_id === x.id) || [...days.values()].some((d) => d.evidence_id === x.id)
              const done = phase === 'done' || (read && !isScan)
              const queued = !done && !isScan && scanned.has(x.id)
              return (
                <button
                  key={x.id}
                  role="tab"
                  aria-selected={isView}
                  disabled={phase === 'reading'}
                  onClick={() => {
                    setSelected(null)
                    setViewEv(x.id)
                  }}
                  className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold shadow-sm backdrop-blur transition-colors ${
                    isView ? 'bg-ink text-paper' : 'bg-card/90 text-ink'
                  }`}
                >
                  {x.type === 'ledger' ? <NotebookPen size={13} aria-hidden /> : <FileText size={13} aria-hidden />}
                  {x.type === 'ledger' ? t('pageShort', { n: pageNo(x) }) : rail}
                  {isScan ? (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-turmeric" />
                  ) : done ? (
                    <Check size={12} strokeWidth={3} className={isView ? 'text-turmeric' : 'text-leaf'} aria-hidden />
                  ) : queued ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-soot/30" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
        <p className="mt-2 flex items-center justify-between gap-2 px-1 text-[13.5px] text-soot-2" aria-live="polite">
          <span className="truncate">{progress}</span>
          <span className="font-mono tnum shrink-0 font-bold text-ink">{t('linesSoFar', { n: entries.length })}</span>
        </p>
      </div>

      {/* The clean digital ledger */}
      <div ref={listRef} className="thin-scroll relative mt-1 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="paper-card overflow-hidden">
          <div className="grid grid-cols-[46px_1fr_92px] border-b border-soot/15 bg-paper-2/60 text-[10.5px] font-bold uppercase tracking-[0.14em] text-soot-3">
            <div className="py-1.5 pl-1.5" />
            <div className="flex justify-between border-l-[1.5px] border-margin/70 py-1.5 pl-3 pr-3.5">
              <span>
                {t('colIn')} / {t('colOut')}
              </span>
            </div>
            <div className="border-l border-dashed border-soot/20 py-1.5 pr-2 text-right">{rail}</div>
          </div>
          <LedgerBook
            entries={entries}
            days={days}
            landed={landed}
            market={app.market}
            rail={rail}
            labels={{ matched: t('matched'), gap: t('gap'), none: t('noRail'), inCol: t('colIn'), outCol: t('colOut') }}
            active={selected}
            onSelect={(id) => select(id)}
          />
          {entries.length === 0 ? <div className="ruled h-40" style={{ ['--rule' as string]: '33px' }} /> : null}
        </div>
      </div>

      {/* flight layer: numbers travel from photo to ledger above everything */}
      <div ref={layerRef} className="pointer-events-none absolute inset-0 z-30 overflow-visible" aria-hidden />
    </div>
  )
}
