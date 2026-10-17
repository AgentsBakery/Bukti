import { BookMarked, ChevronDown, PenLine } from 'lucide-react'
import { motion } from 'motion/react'
import { Collapsible } from 'radix-ui'
import type { Application, Memo } from '../api/types'
import { Stamp, type StampTone } from '../components/Stamp'
import { fmtDate, money, moneyShort, weekOfMonth } from '../lib/format'
import { useLink } from './link'
import { RefChips } from './RefChips'

export const DECISION: Record<Memo['decision'], { label: string; tone: StampTone }> = {
  approve: { label: 'Approve', tone: 'pass' },
  approve_reduced: { label: 'Approve · reduced', tone: 'warn' },
  refer: { label: 'Refer to officer', tone: 'warn' },
  decline: { label: 'Decline', tone: 'fail' },
}

/** Installments as coin stacks against the weekly cash pattern they were shaped to. */
function ScheduleChart({ app, memo, amount }: { app: Application; memo: Memo; amount: number }) {
  const factor = memo.amount ? amount / memo.amount : 1
  const items = memo.schedule.map((s) => ({ ...s, amount: s.amount * factor }))
  if (!items.length) return null
  const pattern = app.metrics?.weekly_pattern ?? [1, 1, 1, 1]
  const W = 480
  const H = 120
  const pad = { l: 4, r: 4, t: 10, b: 18 }
  const max = Math.max(...items.map((i) => i.amount)) * 1.15
  const bw = (W - pad.l - pad.r) / items.length
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const avg = items.reduce((s, i) => s + i.amount, 0) / items.length
  // expected cash curve = average installment × relative weekly cash for that week of month
  const cash = items.map((i) => avg * (pattern[weekOfMonth(i.due_date)] ?? 1))
  const curve = cash.map((v, i) => `${i ? 'L' : 'M'} ${(pad.l + bw * (i + 0.5)).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const coin = 6
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Weekly installments shaped to the weekly cash pattern">
        <path d={`${curve} L ${pad.l + bw * (items.length - 0.5)} ${H - pad.b} L ${pad.l + bw * 0.5} ${H - pad.b} Z`} fill="var(--color-turmeric)" opacity={0.18} />
        <path d={curve} fill="none" stroke="var(--color-turmeric-deep)" strokeWidth={1.6} strokeDasharray="4 3" />
        {items.map((it, i) => {
          const top = y(it.amount)
          const n = Math.max(1, Math.round((H - pad.b - top) / (coin - 1.5)))
          const cx = pad.l + bw * (i + 0.5)
          const rx = Math.min(bw * 0.36, 9)
          return (
            <g key={it.week}>
              <title>
                Week {it.week} · {fmtDate(it.due_date, 'en', { day: 'numeric', month: 'short' }, app.market)} · {money(Math.round(it.amount), app.market)}
              </title>
              {Array.from({ length: n }, (_, k) => {
                const cy = H - pad.b - k * (coin - 1.5) - coin / 2
                return <ellipse key={k} cx={cx} cy={cy} rx={rx} ry={coin / 2} fill={k === n - 1 ? 'url(#coin-face)' : '#D99A1E'} stroke="#9A6400" strokeWidth={0.8} />
              })}
            </g>
          )
        })}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b + 0.5} y2={H - pad.b + 0.5} stroke="rgb(43 38 32 / .25)" />
        {items.map((it, i) =>
          i % 4 === 0 ? (
            <text key={it.week} x={pad.l + bw * (i + 0.5)} y={H - 5} textAnchor="middle" fontSize={9} fill="var(--color-soot-3)">
              {fmtDate(it.due_date, 'en', { day: 'numeric', month: 'short' }, app.market)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-1 flex items-center justify-between text-[11px] text-soot-2">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #FCE7A6, #C8880E)' }} /> installment
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-0 w-3.5 border-t-[1.6px] border-dashed border-turmeric-deep" /> weekly cash pattern
          </span>
        </span>
        <span className="font-mono tnum">
          {moneyShort(Math.min(...items.map((i) => i.amount)), app.market)}–{moneyShort(Math.max(...items.map((i) => i.amount)), app.market)}/wk
        </span>
      </figcaption>
    </figure>
  )
}

function Point({ app, text, refs, tone }: { app: Application; text: string; refs: string[]; tone: 'reason' | 'risk' }) {
  const { hover, pin, refs: active, pinned } = useLink()
  const on = pinned && active.join() === refs.join()
  return (
    <li
      className={`group relative cursor-pointer rounded-xl py-2 pl-7 pr-2 transition-colors ${on ? 'bg-turmeric/25' : 'hover:bg-paper-2/80'}`}
      onMouseEnter={() => refs.length && hover(refs, 'memo')}
      onMouseLeave={() => hover(null)}
      onClick={() => refs.length && pin(refs, 'memo')}
    >
      <span
        className={`absolute left-2 top-[13px] h-2.5 w-2.5 rounded-full ${tone === 'reason' ? 'bg-leaf' : 'bg-turmeric'} ring-[3px] ${tone === 'reason' ? 'ring-leaf/15' : 'ring-turmeric/20'}`}
        aria-hidden
      />
      <p className="text-[13.5px] leading-snug text-soot">{text}</p>
      <RefChips app={app} refs={refs} size="xs" />
    </li>
  )
}

/** Failing checks, stamped right under the headline: the "caught" moment, no scrolling needed. */
function RedFlags({ app }: { app: Application }) {
  const { hover, pin } = useLink()
  const fails = app.checks.filter((c) => c.result === 'fail')
  if (!fails.length) return null
  return (
    <div className="mt-3 rounded-xl border border-chili/30 bg-chili/6 px-3 py-2.5">
      <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-chili-ink">
        {fails.length} red flag{fails.length > 1 ? 's' : ''} — hover to see the proof
      </p>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-2.5">
        {fails.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onMouseEnter={() => hover([c.id], 'check')}
            onMouseLeave={() => hover(null)}
            onFocus={() => hover([c.id], 'check')}
            onBlur={() => hover(null)}
            onClick={() => pin([c.id], 'check')}
            className="rounded-md"
            title={c.summary}
          >
            <Stamp tone="fail" land delay={0.15 + i * 0.12} rotate={i % 2 ? 3 : -3} size={10.5}>
              {c.name}
            </Stamp>
          </button>
        ))}
      </div>
    </div>
  )
}

export function MemoPanel({ app }: { app: Application }) {
  const memo = app.memo
  if (!memo) {
    const writing = app.agent_trace.find((s) => s.agent === 'memo')?.status === 'running'
    return (
      <section className="paper-card relative overflow-hidden p-5">
        <p className="eyebrow">Credit memo</p>
        <div className="mt-3 flex items-center gap-3">
          <motion.span animate={writing ? { rotate: [0, -12, 6, -8, 0], x: [0, 6, 12, 18, 24] } : {}} transition={{ repeat: Infinity, duration: 2.4 }} className="text-ink">
            <PenLine size={22} aria-hidden />
          </motion.span>
          <p className="font-display text-[19px] text-ink">
            {writing ? 'Gemini is writing the memo…' : app.status === 'assessing' ? 'Agents are checking the evidence…' : 'No memo yet'}
          </p>
        </div>
        <div className="ruled mt-4 h-28 opacity-70" style={{ ['--rule' as string]: '22px' }} />
        <p className="mt-2 text-[12.5px] text-soot-2">
          {writing ? 'The writer cites every number to a check or a notebook line. It takes ~15 seconds.' : 'Run the assessment from the borrower’s phone, or wait for it here.'}
        </p>
      </section>
    )
  }
  const d = DECISION[memo.decision]
  const amount = app.decision && app.decision.action !== 'decline' ? app.decision.amount : memo.amount
  return (
    <section className="paper-card relative overflow-hidden">
      <div className="px-5 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Credit memo</p>
            <div className="mt-1 flex items-baseline gap-2">
              {app.decision?.action === 'decline' ? (
                <span className="font-display text-[28px] leading-none text-chili-ink">Declined by officer</span>
              ) : amount > 0 ? (
                <span className="font-display-tight tnum text-[36px] font-semibold leading-none text-ink">{money(amount, app.market)}</span>
              ) : (
                <span className="font-display text-[26px] leading-none text-ink">No amount proposed</span>
              )}
              {memo.tenor_weeks ? <span className="text-[14px] font-bold text-soot-2">· {memo.tenor_weeks} weeks</span> : null}
            </div>
          </div>
          <Stamp tone={d.tone} rotate={-5} size={13} land>
            {d.label}
          </Stamp>
        </div>
        <p className="font-display mt-3 text-[17px] leading-snug text-soot">{memo.headline}</p>
        <RedFlags app={app} />
      </div>
      {memo.schedule.length ? (
        <div className="border-t border-soot/10 px-5 pb-3 pt-3">
          <p className="eyebrow mb-1 !text-[10.5px]">Repayment, shaped to cash flow</p>
          <ScheduleChart app={app} memo={memo} amount={amount} />
        </div>
      ) : null}
      <div className="grid gap-0 border-t border-soot/10 px-3 pb-3 pt-2">
        <p className="eyebrow px-2 pt-1 !text-[10.5px]">Why</p>
        <ul>
          {memo.reasons.map((r, i) => (
            <Point key={i} app={app} text={r.text} refs={r.refs} tone="reason" />
          ))}
        </ul>
        {memo.risks.length ? (
          <>
            <p className="eyebrow px-2 pt-2 !text-[10.5px]">Watch</p>
            <ul>
              {memo.risks.map((r, i) => (
                <Point key={i} app={app} text={r.text} refs={r.refs} tone="risk" />
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <Collapsible.Root className="border-t border-soot/10 px-5 py-2">
        <Collapsible.Trigger className="group flex w-full items-center justify-between py-1 text-[12px] font-bold text-soot-2 hover:text-ink">
          <span className="flex items-center gap-1.5">
            <BookMarked size={13} aria-hidden /> Policy citations ({memo.citations.length}) · written by <span className="font-mono">{memo.model}</span>
          </span>
          <ChevronDown size={14} className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <ul className="space-y-1.5 pb-2 pt-1">
            {memo.citations.map((c, i) => (
              <li key={i} className="text-[12px] leading-snug text-soot-2">
                <b className="text-soot">{c.source}.</b> {c.text}
              </li>
            ))}
          </ul>
        </Collapsible.Content>
      </Collapsible.Root>
    </section>
  )
}
