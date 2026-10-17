import { ChevronDown, Quote } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Collapsible } from 'radix-ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENT_ORDER, type Application, type Check } from '../api/types'
import { Stamp } from '../components/Stamp'
import { revealInScroller } from '../lib/flight'
import { fmtTime, money } from '../lib/format'
import { useLink } from './link'
import { RefChips } from './RefChips'

const RESULT_LABEL = { pass: 'Pass', warn: 'Watch', fail: 'Fail' }

function CheckCard({ app, c, index }: { app: Application; c: Check; index: number }) {
  const { hover, pin, resolved, pinned, refs } = useLink()
  const [open, setOpen] = useState(false)
  const lit = resolved.checks.has(c.id)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (lit && pinned && ref.current) revealInScroller(ref.current)
  }, [lit, pinned, refs])
  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className={`relative rounded-xl border bg-paper/60 transition-colors ${lit ? 'border-turmeric-deep ring-2 ring-turmeric/60' : c.result === 'fail' ? 'border-chili/35' : 'border-soot/12'}`}
      onMouseEnter={() => hover([c.id], 'check')}
      onMouseLeave={() => hover(null)}
    >
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-3 p-3">
          <div className="w-[64px] shrink-0 pt-0.5">
            <Stamp tone={c.result} rotate={index % 2 ? 4 : -5} land delay={0.1} size={11}>
              {RESULT_LABEL[c.result]}
            </Stamp>
          </div>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => pin([c.id], 'check')}>
            <p className="text-[13px] font-extrabold leading-tight text-soot">
              {c.name} <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-soot-3">{c.agent}</span>
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-soot-2">{c.summary}</p>
          </button>
          <Collapsible.Trigger className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-soot-3 hover:bg-paper-2 hover:text-ink" aria-label={`Details for ${c.name}`}>
            <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content>
          <div className="border-t border-dashed border-soot/15 px-3 pb-3 pt-2">
            <p className="font-mono text-[11.5px] leading-relaxed text-soot-2">{c.detail}</p>
            <RefChips app={app} refs={c.evidence_refs} size="xs" />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </motion.div>
  )
}

export function ProofChain({ app }: { app: Application }) {
  const order = (c: Check) => AGENT_ORDER.indexOf(c.agent) * 10 + (c.result === 'fail' ? 0 : c.result === 'warn' ? 1 : 2)
  const checks = [...app.checks].sort((a, b) => order(a) - order(b))
  const tally = { pass: 0, warn: 0, fail: 0 }
  for (const c of app.checks) tally[c.result]++
  return (
    <section className="paper-card px-3 pb-3 pt-3">
      <header className="mb-2 flex items-end justify-between px-1">
        <h2 className="font-display text-[20px] text-ink">Proof chain</h2>
        <span className="flex gap-2 text-[11.5px] font-bold">
          <span className="text-leaf-ink">{tally.pass} pass</span>
          <span className="text-turmeric-deep">{tally.warn} watch</span>
          <span className="text-chili-ink">{tally.fail} fail</span>
        </span>
      </header>
      {checks.length ? (
        <div className="grid gap-2">
          <AnimatePresence initial={false}>
            {checks.map((c, i) => (
              <CheckCard key={c.id} app={app} c={c} index={i} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-soot/20 p-3 text-[13px] text-soot-2">Checks appear here as the reconciler, integrity, benchmark and policy agents run.</p>
      )}
    </section>
  )
}

export function FactsPanel({ app }: { app: Application }) {
  const { hover, pin, resolved } = useLink()
  return (
    <section className="paper-card px-3 pb-3 pt-3">
      <h2 className="font-display mb-2 px-1 text-[20px] text-ink">Interview</h2>
      {app.facts.length ? (
        <ul className="grid gap-2">
          {app.facts.map((f) => {
            const lit = resolved.facts.has(f.id)
            return (
              <li
                key={f.id}
                className={`cursor-pointer rounded-xl border bg-paper/60 p-3 transition-colors ${lit ? 'border-turmeric-deep ring-2 ring-turmeric/60' : 'border-soot/12 hover:border-soot/30'}`}
                role="button"
                tabIndex={0}
                aria-pressed={lit}
                onMouseEnter={() => hover([f.id], 'fact')}
                onMouseLeave={() => hover(null)}
                onFocus={() => hover([f.id], 'fact')}
                onBlur={() => hover(null)}
                onClick={() => pin([f.id], 'fact')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    pin([f.id], 'fact')
                  }
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-soot-3">{f.label}</span>
                  <span className="font-mono text-[10px] text-soot-3">{fmtTime(f.ts)}</span>
                </div>
                <p className="mt-0.5 text-[15px] font-bold text-ink" lang={app.language}>
                  {f.value}
                </p>
                <p className="mt-1 flex gap-1.5 text-[12.5px] italic leading-snug text-soot-2" lang={app.language}>
                  <Quote size={12} className="mt-1 shrink-0 text-turmeric-deep" aria-hidden />
                  {f.quote}
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-soot/20 p-3 text-[13px] text-soot-2">
          {app.agent_trace.find((s) => s.agent === 'interviewer')?.status === 'running' ? 'Interview in progress…' : /skip/i.test(app.agent_trace.find((s) => s.agent === 'interviewer')?.summary ?? '') ? 'The applicant skipped the interview.' : 'No interview yet.'}
        </p>
      )}
    </section>
  )
}

export function AuditTrail({ app }: { app: Application }) {
  const items = useMemo(() => {
    const out: { ts: string; who: string; what: string; tone?: 'pass' | 'warn' | 'fail' | 'ink' }[] = []
    out.push({ ts: app.created_at, who: 'system', what: `Application opened${app.pack_id ? ` from demo pack “${app.pack_id}”` : ''} · ${app.evidence.length} evidence files` })
    for (const s of app.agent_trace) {
      if (s.started_at) out.push({ ts: s.started_at, who: s.agent, what: 'started' })
      if (s.ended_at) out.push({ ts: s.ended_at, who: s.agent, what: s.summary || s.status, tone: s.status === 'error' ? 'fail' : 'ink' })
    }
    if (app.decision)
      out.push({
        ts: app.decision.ts,
        who: app.decision.officer,
        what: `${app.decision.action.toUpperCase()} ${app.decision.action === 'decline' ? '' : money(app.decision.amount, app.market)}${app.decision.note ? ` — “${app.decision.note}”` : ''}`,
        tone: app.decision.action === 'decline' ? 'fail' : 'pass',
      })
    return out.sort((a, b) => a.ts.localeCompare(b.ts))
  }, [app])
  return (
    <section className="paper-card px-3 pb-3 pt-3">
      <h2 className="font-display mb-2 px-1 text-[20px] text-ink">Audit trail</h2>
      <ol className="relative ml-2 border-l border-dashed border-soot/25 pl-4">
        {items.map((it, i) => (
          <li key={i} className="relative pb-2.5 last:pb-0">
            <span
              className={`absolute -left-[21px] top-[5px] h-2.5 w-2.5 rounded-full ring-2 ring-card ${
                it.tone === 'pass' ? 'bg-leaf' : it.tone === 'fail' ? 'bg-chili' : it.what === 'started' ? 'bg-soot/30' : 'bg-ink'
              }`}
              aria-hidden
            />
            <p className="text-[12px] leading-snug text-soot-2">
              <span className="font-mono tnum mr-1.5 text-[10.5px] text-soot-3">{fmtTime(it.ts)}</span>
              <b className="font-bold capitalize text-soot">{it.who}</b> {it.what}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
