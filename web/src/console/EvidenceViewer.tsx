import { FileText, FileX, Maximize, Minus, NotebookPen, Plus, Receipt, Store } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Application, BBox, Evidence } from '../api/types'
import { figure } from '../lib/format'
import { bboxStyle, bboxUnion } from '../lib/hooks'
import { isEmpty, useLink } from './link'

interface View {
  z: number
  x: number
  y: number
}

const ICON = { ledger: NotebookPen, statement: FileText, receipt: Receipt, shop: Store, other: FileX }

export function evidenceShort(app: Application, e: Evidence): string {
  if (e.type === 'ledger') return `p.${app.evidence.filter((x) => x.type === 'ledger').indexOf(e) + 1}`
  if (e.type === 'statement') return app.market === 'ID' ? 'QRIS' : 'UPI'
  return e.type === 'receipt' ? 'Receipt' : 'Shop'
}

export function EvidenceViewer({ app, viewEv, setViewEv }: { app: Application; viewEv: string | null; setViewEv: (id: string) => void }) {
  const { resolved, pinned, pinSeq, pin, hover } = useLink()
  const port = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ z: 1, x: 0, y: 0 })
  const [anim, setAnim] = useState(true)
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const ev = app.evidence.find((e) => e.id === viewEv) ?? app.evidence[0]
  const isStatement = ev?.type === 'statement'

  useLayoutEffect(() => {
    const el = port.current
    if (!el) return
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setVp({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // base (fit) size of the photo inside the viewport
  const pad = 18
  const aspect = ev ? ev.width / ev.height : 0.75
  const fitW = Math.max(1, Math.min(vp.w - pad * 2, (vp.h - pad * 2) * aspect))
  const fitH = fitW / aspect

  const clamp = useCallback(
    (v: View): View => {
      const w = fitW * v.z
      const h = fitH * v.z
      const x = w <= vp.w ? (vp.w - w) / 2 : Math.min(pad, Math.max(vp.w - w - pad, v.x))
      const y = h <= vp.h ? (vp.h - h) / 2 : Math.min(pad, Math.max(vp.h - h - pad, v.y))
      return { z: v.z, x, y }
    },
    [fitW, fitH, vp.w, vp.h],
  )
  const fit = useCallback(() => setView(clamp({ z: 1, x: 0, y: 0 })), [clamp])
  useEffect(() => {
    setAnim(false)
    fit()
    const t = window.setTimeout(() => setAnim(true), 50)
    return () => window.clearTimeout(t)
  }, [ev?.id, vp.w, vp.h]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback(
    (factor: number, px = vp.w / 2, py = vp.h / 2) => {
      setView((v) => {
        const z = Math.max(1, Math.min(5, v.z * factor))
        return clamp({ z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z })
      })
    },
    [clamp, vp.w, vp.h],
  )
  const focusBox = useCallback(
    (u: BBox) => {
      const bw = ((u[3] - u[1]) / 1000) * fitW
      const bh = ((u[2] - u[0]) / 1000) * fitH
      const cx = ((u[1] + u[3]) / 2000) * fitW
      const cy = ((u[0] + u[2]) / 2000) * fitH
      const z = Math.max(1, Math.min(2.6, (vp.w * 0.82) / Math.max(bw, 40), (vp.h * 0.66) / Math.max(bh, 30)))
      setAnim(true)
      setView(clamp({ z, x: vp.w / 2 - cx * z, y: vp.h / 2 - cy * z }))
    },
    [clamp, fitW, fitH, vp.w, vp.h],
  )

  // wheel zoom (non-passive so we can keep the page still)
  useEffect(() => {
    const el = port.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setAnim(false)
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // keyboard zoom via console shortcuts
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<string>).detail
      setAnim(true)
      if (d === 'in') zoomAt(1.35)
      else if (d === 'out') zoomAt(1 / 1.35)
      else fit()
    }
    window.addEventListener('bukti:zoom', on)
    return () => window.removeEventListener('bukti:zoom', on)
  }, [zoomAt, fit])

  // which evidence holds the linked things?
  const entryEv = useMemo(() => new Map(app.entries.map((e) => [e.id, e.evidence_id])), [app.entries])
  const statementEv = app.evidence.find((e) => e.type === 'statement')
  const linkedDates = useMemo(() => {
    const s = new Set(resolved.days)
    for (const id of resolved.entries) {
      const en = app.entries.find((e) => e.id === id)
      if (en) s.add(en.date)
    }
    return s
  }, [resolved, app.entries])
  const evHasLink = useCallback(
    (id: string) =>
      resolved.evidence.has(id) || [...resolved.entries].some((e) => entryEv.get(e) === id) || (statementEv?.id === id && resolved.days.size > 0),
    [resolved, entryEv, statementEv],
  )

  const switchTimer = useRef<number | null>(null)
  useEffect(() => {
    if (switchTimer.current) window.clearTimeout(switchTimer.current)
    if (isEmpty(resolved) || !ev || evHasLink(ev.id)) return
    const target =
      [...resolved.entries].map((e) => entryEv.get(e)).find(Boolean) ??
      [...resolved.evidence][0] ??
      (resolved.days.size ? statementEv?.id : undefined)
    if (!target) return
    switchTimer.current = window.setTimeout(() => setViewEv(target), pinned ? 0 : 260)
    return () => {
      if (switchTimer.current) window.clearTimeout(switchTimer.current)
    }
  }, [resolved, pinned]) // eslint-disable-line react-hooks/exhaustive-deps

  // on an explicit pin, glide the camera to what was pinned
  useEffect(() => {
    if (!pinned || !ev) return
    const t = window.setTimeout(() => {
      const boxes: BBox[] = []
      for (const id of resolved.entries) {
        const en = app.entries.find((e) => e.id === id && e.evidence_id === ev.id)
        if (en) boxes.push(en.row_bbox ?? en.bbox)
      }
      if (isStatement) for (const d of app.statement) if (d.bbox && linkedDates.has(d.date)) boxes.push(d.bbox)
      const u = bboxUnion(boxes)
      if (u) focusBox(u)
      else fit()
    }, 320)
    return () => window.clearTimeout(t)
  }, [pinSeq, ev?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const entriesHere = app.entries.filter((e) => e.evidence_id === ev?.id)
  const daysHere = isStatement ? app.statement.filter((d) => d.evidence_id === ev?.id && d.bbox) : []
  const evLinked = ev ? resolved.evidence.has(ev.id) : false
  const anyLinked = !isEmpty(resolved)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) {
      d.moved = true
      port.current?.setPointerCapture(d.id)
      setAnim(false)
    }
    d.x = e.clientX
    d.y = e.clientY
    setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  const onPointerUp = () => {
    window.setTimeout(() => (drag.current = null), 0)
  }

  const avgConf = entriesHere.length ? entriesHere.reduce((s, e) => s + e.confidence, 0) / entriesHere.length : 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] bg-[#27231e] shadow-[0_18px_40px_-24px_rgb(0_0_0/0.8)] ring-1 ring-black/30">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-2.5 py-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Evidence photos">
          {app.evidence.map((e, i) => {
            const Icon = ICON[e.type]
            const on = e.id === ev?.id
            const linked = evHasLink(e.id) && !on
            return (
              <button
                key={e.id}
                role="tab"
                aria-selected={on}
                onClick={() => setViewEv(e.id)}
                title={`${e.label} (${i + 1})`}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-bold transition-colors ${
                  on ? 'bg-paper text-ink' : 'text-paper/75 hover:bg-white/10 hover:text-paper'
                } ${linked ? 'ring-2 ring-turmeric' : ''}`}
              >
                <Icon size={14} aria-hidden /> {evidenceShort(app, e)}
                <kbd className={`ml-0.5 font-mono text-[10px] ${on ? 'text-soot-3' : 'text-paper/40'}`}>{i + 1}</kbd>
              </button>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-white/5 p-0.5 text-paper/80">
          <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10" onClick={() => zoomAt(1 / 1.35)} aria-label="Zoom out (−)">
            <Minus size={15} />
          </button>
          <span className="font-mono tnum w-11 text-center text-[11.5px]">{Math.round(view.z * 100)}%</span>
          <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10" onClick={() => zoomAt(1.35)} aria-label="Zoom in (+)">
            <Plus size={15} />
          </button>
          <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10" onClick={fit} aria-label="Fit to view (0)">
            <Maximize size={14} />
          </button>
        </div>
      </div>

      <div
        ref={port}
        className={`relative min-h-0 flex-1 overflow-hidden ${view.z > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px)', backgroundSize: '18px 18px', touchAction: 'none' }}
        role="application"
        aria-label="Evidence photo. Drag to pan, scroll or press plus and minus to zoom, 0 to fit."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={(e) => {
          const r = port.current!.getBoundingClientRect()
          setAnim(true)
          zoomAt(view.z > 2 ? 1 / view.z : 2, e.clientX - r.left, e.clientY - r.top)
        }}
      >
        {ev ? (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              // size (not scale) the canvas so the photo is re-rasterised crisp at every zoom
              width: fitW * view.z,
              height: fitH * view.z,
              transform: `translate(${view.x}px, ${view.y}px)`,
              transition: anim ? 'transform .55s var(--ease-ink), width .55s var(--ease-ink), height .55s var(--ease-ink)' : 'none',
            }}
          >
            <img
              src={ev.url}
              alt={ev.label}
              draggable={false}
              className={`absolute inset-0 h-full w-full rounded-[2px] object-fill shadow-[0_14px_36px_-8px_rgb(0_0_0/0.7)] transition-[outline-color] ${evLinked ? 'outline outline-[3px] outline-offset-4 outline-turmeric' : ''}`}
            />
            {entriesHere.map((en) => {
              const on = resolved.entries.has(en.id)
              const dim = anyLinked && !on
              const isIn = en.amount_in > 0
              return (
                <div key={en.id}>
                  <button
                    type="button"
                    data-entry={en.id}
                    aria-label={`${en.date} ${en.description} ${figure(isIn ? en.amount_in : en.amount_out, app.market)}`}
                    className="hl block cursor-pointer"
                    style={{
                      ...bboxStyle(en.row_bbox ?? en.bbox, 3),
                      opacity: on ? 0.82 : dim ? 0.12 : 0.34,
                      animation: on ? 'hl-pulse 1.2s ease-in-out infinite' : undefined,
                      transition: 'opacity .25s',
                    }}
                    onMouseEnter={() => hover([en.id], 'photo')}
                    onMouseLeave={() => hover(null)}
                    onClick={(e) => {
                      if (drag.current?.moved) return
                      e.stopPropagation()
                      pin([en.id], 'photo')
                    }}
                  />
                  {on ? (
                    <div
                      className="pointer-events-none rounded-[5px] border-2 border-ink"
                      style={{ ...bboxStyle(en.bbox, 4), animation: 'ring-pulse 1.4s ease-out infinite' }}
                      aria-hidden
                    />
                  ) : null}
                  {en.confidence < 0.8 ? (
                    <span
                      className="pointer-events-none absolute h-2 w-2 -translate-x-3 rounded-full bg-chili ring-2 ring-white"
                      style={{ top: `${((en.bbox[0] + en.bbox[2]) / 2) / 10}%`, left: `${(en.row_bbox ?? en.bbox)[1] / 10}%` }}
                      title={`Low confidence ${Math.round(en.confidence * 100)}%`}
                    />
                  ) : null}
                </div>
              )
            })}
            {daysHere.map((d) => {
              const on = linkedDates.has(d.date)
              return (
                <button
                  type="button"
                  key={d.date}
                  aria-label={`${d.date}: ${d.transactions} transactions`}
                  className="hl block cursor-pointer"
                  style={{
                    ...bboxStyle(d.bbox!, 1),
                    background: d.transactions === 0 ? 'var(--color-chili)' : undefined,
                    opacity: on ? 0.7 : anyLinked ? 0.08 : d.transactions === 0 ? 0.35 : 0.18,
                    animation: on ? 'hl-pulse 1.2s ease-in-out infinite' : undefined,
                  }}
                  onMouseEnter={() => hover([`day:${d.date}`], 'photo')}
                  onMouseLeave={() => hover(null)}
                  onFocus={() => hover([`day:${d.date}`], 'photo')}
                  onBlur={() => hover(null)}
                  onClick={() => !drag.current?.moved && pin([`day:${d.date}`], 'photo')}
                  title={`${d.date}: ${d.transactions} transactions`}
                />
              )
            })}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-paper/50">No evidence yet</div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2 text-[11.5px] text-paper/60">
          <span>{ev?.label}</span>
          {entriesHere.length ? (
            <span className="font-mono tnum">
              {entriesHere.length} lines · conf {Math.round(avgConf * 100)}%
            </span>
          ) : daysHere.length ? (
            <span className="font-mono tnum">{daysHere.length} days</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
