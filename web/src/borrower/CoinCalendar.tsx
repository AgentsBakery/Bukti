import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import type { Lang, Market, ScheduleItem } from '../api/types'
import { fmtDate, locale, money, moneyShort, parseISODate } from '../lib/format'

function Coin({ d, glyph }: { d: number; glyph: string }) {
  return (
    <svg width={d} height={d} viewBox="-50 -50 100 100" aria-hidden>
      <circle r="48" fill="#9A6400" />
      <circle r="45" cy="-2" fill="url(#coin-face)" />
      <circle r="36" cy="-2" fill="none" stroke="#9A6400" strokeOpacity="0.45" strokeWidth="2.5" strokeDasharray="1 5.2" strokeLinecap="round" />
      {d >= 38 ? (
        <text y="10" textAnchor="middle" fontSize="30" fontWeight="800" fill="#8a5a00" fillOpacity="0.85" style={{ fontFamily: 'var(--font-display)' }}>
          {glyph}
        </text>
      ) : null}
    </svg>
  )
}

/**
 * Repayment schedule as coins on a calendar: one row per month, one coin per weekly
 * installment, sized by the amount due — so the cash-flow shape is visible at a glance.
 */
export function CoinCalendar({
  schedule,
  market,
  lang,
  detailLabel,
  hint,
  delay = 0,
}: {
  schedule: ScheduleItem[]
  market: Market
  lang: Lang
  detailLabel: (s: ScheduleItem) => string
  hint?: string
  delay?: number
}) {
  const [sel, setSel] = useState<number | null>(null)
  const { rows, min, max } = useMemo(() => {
    const amounts = schedule.map((s) => s.amount)
    const byMonth = new Map<string, ScheduleItem[]>()
    for (const s of schedule) {
      const k = s.due_date.slice(0, 7)
      byMonth.set(k, [...(byMonth.get(k) ?? []), s])
    }
    return { rows: [...byMonth.entries()], min: Math.min(...amounts), max: Math.max(...amounts) }
  }, [schedule])
  const size = (a: number) => 24 + (max > min ? ((a - min) / (max - min)) * 26 : 13)
  const glyph = market === 'ID' ? 'Rp' : '₹'
  const monthFmt = new Intl.DateTimeFormat(locale(lang, market), { month: 'short' })
  const selected = schedule.find((s) => s.week === sel)
  let idx = 0

  return (
    <div>
      <div className={`min-h-[24px] pt-1 text-center text-[14px] ${selected ? 'font-bold text-ink' : 'font-hand text-[15px] text-soot-3'}`} aria-live="polite">
        {selected ? detailLabel(selected) : hint}
      </div>
      <div className="margin-line mt-1" style={{ ['--margin-x' as string]: '46px' }}>
        {rows.map(([month, items]) => (
          <div key={month} className="grid grid-cols-[46px_1fr] items-center border-b border-[color:var(--rule-color)] py-1.5 last:border-b-0">
            <div className="font-hand pl-0.5 text-[16px] leading-none text-ink">{monthFmt.format(parseISODate(`${month}-01`))}</div>
            <div className="grid grid-cols-5 items-end pl-2">
              {[0, 1, 2, 3, 4].map((col) => {
                const s = items.find((x) => Math.min(4, Math.floor((parseISODate(x.due_date).getDate() - 1) / 7)) === col)
                if (!s) return <div key={col} />
                const d = size(s.amount)
                const i = idx++
                return (
                  <motion.button
                    type="button"
                    key={col}
                    onClick={() => setSel((v) => (v === s.week ? null : s.week))}
                    aria-label={`${fmtDate(s.due_date, lang, { day: 'numeric', month: 'long' }, market)}: ${money(s.amount, market)}`}
                    aria-pressed={sel === s.week}
                    initial={{ y: -26, opacity: 0, scale: 0.6 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 17, delay: delay + i * 0.045 }}
                    className={`flex flex-col items-center gap-0.5 rounded-xl py-1 ${sel === s.week ? 'bg-turmeric/20 ring-1 ring-turmeric' : ''}`}
                  >
                    <div className="grid h-[52px] place-items-end">
                      <Coin d={d} glyph={glyph} />
                    </div>
                    <span className="font-mono tnum text-[10.5px] font-bold leading-none text-soot-2">{moneyShort(s.amount, market, lang).replace(/^Rp\s?/, '').replace(/^₹/, '')}</span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
