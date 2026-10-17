import { BookOpenCheck, Calculator, FileSignature, GitCompareArrows, Mic, ScanText, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { AGENT_ORDER, type AgentName, type AgentStep, type Application } from '../api/types'
import { useNow } from '../lib/hooks'

const META: Record<AgentName, { label: string; Icon: typeof ScanText; model?: 'extract' | 'live' | 'memo' }> = {
  extractor: { label: 'Extractor', Icon: ScanText, model: 'extract' },
  interviewer: { label: 'Interviewer', Icon: Mic, model: 'live' },
  reconciler: { label: 'Reconciler', Icon: GitCompareArrows },
  integrity: { label: 'Integrity', Icon: BookOpenCheck },
  benchmark: { label: 'Benchmark', Icon: Users },
  policy: { label: 'Policy', Icon: Calculator },
  memo: { label: 'Memo', Icon: FileSignature, model: 'memo' },
}

function duration(s: AgentStep, now: number): string | null {
  if (!s.started_at) return null
  const a = Date.parse(s.started_at)
  const b = s.ended_at ? Date.parse(s.ended_at) : now
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const sec = Math.max(0, (b - a) / 1000)
  return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`
}

/** The agent pipeline drawn in ink: connectors fill as each step completes. */
export function AgentGraph({ app, models }: { app: Application; models?: Record<string, string> }) {
  const now = useNow(500)
  const steps = AGENT_ORDER.map((a) => app.agent_trace.find((s) => s.agent === a) ?? { agent: a, status: 'pending' as const, summary: '' })
  const n = steps.length
  return (
    <div className="relative">
      {/* connectors */}
      <svg className="pointer-events-none absolute left-0 right-0 top-[22px] h-[12px] w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 12" aria-hidden>
        {steps.slice(0, -1).map((s, i) => {
          const x1 = ((i + 0.5) / n) * 1000 + 30
          const x2 = ((i + 1.5) / n) * 1000 - 30
          const next = steps[i + 1]
          const filled = s.status === 'done' && next.status !== 'pending'
          const flowing = s.status === 'done' && next.status === 'pending'
          const mid = (x1 + x2) / 2
          const d = `M ${x1} 6 C ${mid - 20} ${i % 2 ? 1 : 11}, ${mid + 20} ${i % 2 ? 11 : 1}, ${x2} 6`
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="rgb(43 38 32 / .28)" strokeWidth="1.5" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <motion.path
                d={d}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth="2.4"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                initial={false}
                animate={{ pathLength: filled ? 1 : flowing ? 0.35 : 0 }}
                transition={{ duration: 0.9, ease: [0.22, 0.8, 0.24, 1] }}
              />
            </g>
          )
        })}
      </svg>
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {steps.map((s) => {
          const { label, Icon, model } = META[s.agent]
          const skipped = s.agent === 'interviewer' && s.status === 'done' && /skip/i.test(s.summary)
          const dur = duration(s, now)
          const tone =
            s.status === 'done'
              ? skipped
                ? 'border-ink/40 bg-paper text-ink/60 border-dashed'
                : 'border-ink bg-ink text-paper'
              : s.status === 'running'
                ? 'border-turmeric-deep bg-turmeric text-ink'
                : s.status === 'error'
                  ? 'border-chili bg-chili text-paper'
                  : 'border-soot/25 bg-card text-soot/40 border-dashed'
          return (
            <li key={s.agent} className="flex min-w-0 flex-col items-center px-1 text-center" title={s.summary || label}>
              <div className="relative">
                {s.status === 'running' ? (
                  <>
                    <span className="absolute inset-0 rounded-full bg-turmeric" style={{ animation: 'pulse-ring 1.4s ease-out infinite' }} aria-hidden />
                    <svg className="absolute -inset-[7px] h-[calc(100%+14px)] w-[calc(100%+14px)] animate-spin-slow" viewBox="0 0 60 60" aria-hidden>
                      <circle cx="30" cy="30" r="28" fill="none" stroke="var(--color-turmeric-deep)" strokeWidth="1.6" strokeDasharray="3 6" />
                    </svg>
                  </>
                ) : null}
                <motion.div
                  className={`relative grid h-[46px] w-[46px] place-items-center rounded-full border-2 transition-colors duration-500 ${tone}`}
                  animate={s.status === 'running' ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                  transition={s.status === 'running' ? { repeat: Infinity, duration: 1.6 } : { duration: 0.3 }}
                >
                  <Icon size={20} aria-hidden />
                </motion.div>
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <span className={`text-[12.5px] font-extrabold ${s.status === 'pending' ? 'text-soot-3' : 'text-soot'}`}>{label}</span>
                {dur && !skipped ? <span className="font-mono tnum text-[10px] text-soot-3">{dur}</span> : null}
              </div>
              {model && models?.[model] ? <span className="font-mono mt-0.5 rounded bg-ink/8 px-1 text-[9.5px] text-ink-soft">{models[model]}</span> : null}
              <p className={`mt-0.5 line-clamp-2 text-[10.5px] leading-tight ${s.status === 'error' ? 'text-chili-ink' : 'text-soot-2'}`}>
                {skipped ? 'skipped' : s.summary || (s.status === 'pending' ? 'waiting' : '')}
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
