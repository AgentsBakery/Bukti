import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { BBox } from '../api/types'
import { Stamp } from '../components/Stamp'
import { bboxStyle } from '../lib/hooks'

// A still of the signature moment: numbers peel off Ibu Sari's notebook and settle into a clean ledger.
const ROWS: { id: string; date: string; desc: string; amt: string; row: BBox; box: BBox; rail?: string; out?: boolean }[] = [
  { id: 'a', date: '1/9', desc: 'Jualan', amt: '544.500', row: [81.6, 41.9, 115.1, 732.3], box: [89.6, 597.8, 111.4, 730.6], rail: '257.300' },
  { id: 'b', date: '2/9', desc: 'Jualan', amt: '561.000', row: [120.9, 41.3, 154.5, 725.0], box: [128.9, 595.5, 150.1, 723.3], rail: '237.700' },
  { id: 'c', date: '2/9', desc: 'Beli gas 3kg', amt: '70.000', row: [159.7, 40.7, 197.4, 913.6], box: [170.8, 799.8, 196.1, 911.8], out: true },
  { id: 'd', date: '3/9', desc: 'Jualan', amt: '617.500', row: [200.9, 40.9, 235.2, 733.8], box: [208.4, 600.9, 233.9, 732.1], rail: '164.100' },
]
const FLY = ['a', 'b', 'd']

interface Thread {
  id: string
  d: string
  mx: number
  my: number
}

export function HeroIllustration() {
  const root = useRef<HTMLDivElement>(null)
  const [threads, setThreads] = useState<Thread[]>([])

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const R = el.getBoundingClientRect()
      const s = R.width / el.offsetWidth || 1
      const out: Thread[] = []
      for (const id of FLY) {
        const a = el.querySelector(`[data-hsrc="${id}"]`)?.getBoundingClientRect()
        const b = el.querySelector(`[data-hdst="${id}"]`)?.getBoundingClientRect()
        if (!a || !b) continue
        const x1 = (a.right - R.left) / s
        const y1 = (a.top + a.height / 2 - R.top) / s
        const x2 = (b.left - R.left) / s - 4
        const y2 = (b.top + b.height / 2 - R.top) / s
        const cx = (x1 + x2) / 2
        const c1 = [cx + 30, y1 - 60]
        const c2 = [cx - 10, y2 - 70]
        // park each slip at a different point along its own thread so they never stack
        const t = [0.3, 0.46, 0.6][out.length] ?? 0.5
        const u = 1 - t
        const bx = u * u * u * x1 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * x2
        const by = u * u * u * y1 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * y2
        out.push({ id, d: `M ${x1} ${y1} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${x2} ${y2}`, mx: bx, my: by })
      }
      setThreads(out)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const t = window.setTimeout(measure, 1400)
    return () => {
      ro.disconnect()
      window.clearTimeout(t)
    }
  }, [])

  return (
    <div ref={root} className="relative mx-auto h-[560px] w-[600px] select-none" aria-hidden>
      {/* QRIS statement behind */}
      <motion.div
        className="absolute left-[262px] top-[6px] w-[300px] overflow-hidden rounded-[4px] bg-white shadow-[0_18px_40px_-18px_rgb(40_25_5/0.55)]"
        initial={{ opacity: 0, x: 40, rotate: 12 }}
        animate={{ opacity: 1, x: 0, rotate: 6 }}
        transition={{ duration: 1, ease: [0.22, 0.8, 0.24, 1], delay: 0.35 }}
      >
        <img src="/mock/sari/statement.png" alt="" className="block w-full opacity-95" />
      </motion.div>

      {/* the notebook page */}
      <motion.div
        className="absolute left-[8px] top-[34px] h-[480px] w-[360px] rounded-[3px] shadow-[0_26px_50px_-20px_rgb(40_25_5/0.7),0_2px_0_rgb(255_255_255/0.4)_inset]"
        initial={{ opacity: 0, y: 40, rotate: -9 }}
        animate={{ opacity: 1, y: 0, rotate: -3 }}
        transition={{ duration: 1.1, ease: [0.22, 0.8, 0.24, 1], delay: 0.15 }}
      >
        <img src="/mock/sari/page1.jpg" alt="" className="absolute inset-0 h-full w-full rounded-[3px] object-cover" />
        {ROWS.map((r, i) => (
          <div key={r.id}>
            <motion.div
              className="hl"
              style={bboxStyle(r.row, 3)}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 1.1 + i * 0.28, ease: [0.3, 0.7, 0.2, 1] }}
            />
            <div data-hsrc={r.id} style={bboxStyle(r.box)} />
          </div>
        ))}
        <motion.div
          className="scanline"
          initial={{ top: '0%', opacity: 0 }}
          animate={{ top: ['2%', '16%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.6, delay: 0.9, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* threads + lifting slips */}
      <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
        {threads.map((t, i) => (
          <motion.path
            key={t.id}
            d={t.d}
            fill="none"
            stroke="var(--color-turmeric-deep)"
            strokeWidth={1.2}
            strokeDasharray="2 4"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.85 }}
            transition={{ duration: 0.9, delay: 0.2 + i * 0.25 }}
          />
        ))}
      </svg>
      {threads.map((t, i) => {
        const r = ROWS.find((x) => x.id === t.id)!
        return (
          <motion.div
            key={t.id}
            className="absolute z-20"
            style={{ left: t.mx, top: t.my }}
            initial={{ opacity: 0, scale: 0.4, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.5 + i * 0.25 }}
          >
            <div
              className="font-mono tnum -translate-x-1/2 -translate-y-1/2 rounded-md border border-soot/15 bg-card px-2.5 py-1 text-[17px] font-bold text-ink shadow-[0_14px_22px_-10px_rgb(30_42_90/0.55)]"
              style={{ animation: `float-slip 4.2s ease-in-out ${i * 0.7}s infinite`, rotate: `${[-4, 3, -2][i]}deg` }}
            >
              {r.amt}
            </div>
          </motion.div>
        )
      })}

      {/* the clean digital ledger */}
      <motion.div
        className="paper-card absolute left-[330px] top-[300px] w-[258px] overflow-hidden"
        initial={{ opacity: 0, y: 30, rotate: 6 }}
        animate={{ opacity: 1, y: 0, rotate: 2 }}
        transition={{ duration: 0.9, ease: [0.22, 0.8, 0.24, 1], delay: 0.7 }}
      >
        <div className="flex items-center justify-between border-b border-soot/10 bg-paper-2/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-soot-3">
          <span>Buku kas · Sep</span>
          <span>QRIS</span>
        </div>
        {ROWS.map((r) => (
          <div key={r.id} className="relative grid grid-cols-[34px_1fr_62px] border-b border-[color:var(--rule-color)] text-[12px] last:border-b-0">
            <span className="font-hand pl-2 pt-1.5 text-ink">{r.date}</span>
            <span className="flex items-center justify-between gap-1 border-l border-margin/70 py-1.5 pl-2 pr-2">
              <span className="truncate text-soot-2">{r.desc}</span>
              <span data-hdst={r.id} className={`font-mono tnum font-bold ${r.out ? 'text-chili-ink' : 'text-ink'}`}>
                {r.out ? '−' : ''}
                {r.amt}
              </span>
            </span>
            <span className="font-mono tnum relative border-l border-dashed border-soot/20 py-1.5 pr-2 text-right text-[11px] font-bold text-leaf-ink">{r.rail ?? ''}</span>
          </div>
        ))}
        <div className="absolute -right-1 bottom-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1 }}>
            <Stamp tone="pass" land delay={2.1} rotate={-8} size={11}>
              cocok ✓
            </Stamp>
          </motion.div>
        </div>
      </motion.div>

      <motion.p
        className="font-hand absolute left-[24px] top-[524px] text-[18px] text-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.3 }}
      >
        every number keeps its place on the page ↑
      </motion.p>
    </div>
  )
}
