import { motion } from 'motion/react'
import { forwardRef, useMemo } from 'react'
import type { Entry, Market, StatementDay } from '../api/types'
import { Stamp } from '../components/Stamp'
import { figure, notebookDate } from '../lib/format'

export type DayMatch = 'ok' | 'gap' | 'none'

export function dayMatch(ledgerSales: number, day: StatementDay | undefined): DayMatch | null {
  if (!day || ledgerSales <= 0) return null
  if (day.transactions === 0 || day.total === 0) return 'none'
  const r = day.total / ledgerSales
  return r >= 0.15 && r <= 0.85 ? 'ok' : 'gap'
}

interface Props {
  entries: Entry[]
  days: Map<string, StatementDay>
  landed: Set<string>
  market: Market
  rail: string
  labels: { matched: string; gap: string; none: string; inCol: string; outCol: string }
  active?: string | null
  onSelect?: (entryId: string) => void
  /** console linking: rows/dates lit by the current link */
  highlighted?: Set<string>
  highlightDates?: Set<string>
  onHover?: (entryId: string | null) => void
  /** dense = console style */
  dense?: boolean
}

/** The clean digital ledger the photo becomes. Dates sit in the margin like the notebook. */
export const LedgerBook = forwardRef<HTMLDivElement, Props>(function LedgerBook(
  { entries, days, landed, market, labels, active, onSelect, highlighted, highlightDates, onHover, dense = false },
  ref,
) {
  const groups = useMemo(() => {
    const byDate = new Map<string, Entry[]>()
    for (const e of entries) {
      const list = byDate.get(e.date) ?? []
      list.push(e)
      byDate.set(e.date, list)
    }
    for (const d of days.keys()) if (!byDate.has(d)) byDate.set(d, [])
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [entries, days])

  return (
    <div ref={ref} className="relative">
      {groups.map(([date, lines]) => {
        const day = days.get(date)
        const sales = lines.reduce((s, e) => s + e.amount_in, 0)
        const dayLanded = landed.has(`day:${date}`)
        const match = dayLanded ? dayMatch(sales, day) : null
        return (
          <motion.div
            key={date}
            data-date={date}
            layout="position"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 0.8, 0.24, 1] }}
            className={`relative grid border-b border-[color:var(--rule-color)] transition-colors ${dense ? 'grid-cols-[38px_1fr_86px]' : 'grid-cols-[46px_1fr_92px]'} ${highlightDates?.has(date) ? 'bg-turmeric/15' : ''}`}
          >
            <div className={`font-hand text-ink ${dense ? 'pt-1.5 text-[13px]' : 'pt-2 text-[15px]'} pl-1 leading-none`}>{notebookDate(date)}</div>
            <div className={`min-w-0 border-l-[1.5px] border-margin/70 ${dense ? 'py-1 pl-2 pr-1.5' : 'py-1.5 pl-3 pr-2'}`}>
              {lines.map((e) => {
                const isIn = e.amount_in > 0
                const isActive = active === e.id || !!highlighted?.has(e.id)
                return (
                  <motion.button
                    type="button"
                    key={e.id}
                    data-row={e.id}
                    onClick={() => onSelect?.(e.id)}
                    onMouseEnter={onHover ? () => onHover(e.id) : undefined}
                    onMouseLeave={onHover ? () => onHover(null) : undefined}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex w-full items-baseline justify-between gap-2 rounded-md text-left ${dense ? 'min-h-[26px] px-1 text-[13px]' : 'min-h-[32px] px-1.5 text-[15px]'} ${isActive ? 'bg-turmeric/25 ring-1 ring-turmeric' : 'hover:bg-paper-3/50'}`}
                    aria-label={`${notebookDate(date)} ${e.description} ${isIn ? '' : '−'}${figure(isIn ? e.amount_in : e.amount_out, market)}`}
                    aria-pressed={onHover ? isActive : undefined}
                  >
                    <span className={`truncate ${isIn ? 'text-soot' : 'text-soot-2'}`}>
                      {e.confidence < 0.8 ? <i className="mr-1 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-chili" title={`Low confidence ${Math.round(e.confidence * 100)}%`} /> : null}
                      {e.description}
                    </span>
                    <span
                      data-amt={e.id}
                      className={`font-mono tnum shrink-0 font-bold transition-opacity duration-200 ${isIn ? 'text-ink' : 'text-chili-ink'}`}
                      style={{ opacity: landed.has(e.id) ? 1 : 0 }}
                    >
                      {isIn ? '' : '−'}
                      {figure(isIn ? e.amount_in : e.amount_out, market)}
                    </span>
                  </motion.button>
                )
              })}
            </div>
            <div className={`relative border-l border-dashed border-soot/20 text-right ${dense ? 'px-1.5 py-1' : 'px-2 py-1.5'}`}>
              {day ? (
                <div className="flex flex-col items-end gap-1">
                  <div
                    data-rail={date}
                    className={`font-mono tnum font-bold leading-tight text-leaf-ink transition-opacity duration-200 ${dense ? 'text-[12px]' : 'text-[13.5px]'}`}
                    style={{ opacity: dayLanded ? 1 : 0 }}
                  >
                    {day.transactions === 0 ? '—' : figure(day.total, market)}
                  </div>
                  {match ? (
                    <div className="pointer-events-none -mr-0.5">
                      <Stamp tone={match === 'ok' ? 'pass' : match === 'gap' ? 'warn' : 'fail'} land rotate={match === 'ok' ? -5 : 4} size={dense ? 8 : 9} delay={0.12}>
                        {match === 'ok' ? `${labels.matched} ✓` : match === 'gap' ? labels.gap : labels.none}
                      </Stamp>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
})
