import { BrainCircuit, Flag, Gavel, KeyRound, LogIn, MessagesSquare, Mic, Play, ScrollText, ShieldAlert, SquareCheck, Upload, Wrench, X } from 'lucide-react'
import { Dialog, ToggleGroup } from 'radix-ui'
import { useMemo, useState } from 'react'
import type { RunEvent, RunEventType } from '../api/types'
import { Stamp } from '../components/Stamp'

export interface RunTotals {
  modelCalls: number
  toolCalls: number
  tokensIn: number
  tokensOut: number
  cost: number
  wallMs: number
}

export function totals(events: RunEvent[]): RunTotals {
  const ev = events.filter((e) => e.type !== 'auth.login')
  const ts = ev.map((e) => Date.parse(e.ts)).filter((x) => !Number.isNaN(x))
  return {
    modelCalls: ev.filter((e) => e.type === 'model.call').length,
    toolCalls: ev.filter((e) => e.type === 'tool.call').length,
    tokensIn: ev.reduce((s, e) => s + (e.input_tokens ?? 0), 0),
    tokensOut: ev.reduce((s, e) => s + (e.output_tokens ?? 0), 0),
    cost: ev.reduce((s, e) => s + (e.cost_usd ?? 0), 0),
    wallMs: ts.length ? Math.max(...ts) - Math.min(...ts) : 0,
  }
}

export const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))
export const fmtCost = (c: number) => (c === 0 ? '$0' : c < 0.01 ? `$${c.toFixed(4)}` : `$${c.toFixed(3)}`)
export function fmtDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`
  const m = Math.floor(s / 60)
  return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`
}

const KIND: Record<RunEventType, { label: string; Icon: typeof Play; tone: 'ink' | 'turmeric' | 'leaf' | 'chili' | 'soot' }> = {
  'auth.login': { label: 'Sign-in', Icon: LogIn, tone: 'soot' },
  'application.created': { label: 'Opened', Icon: Flag, tone: 'soot' },
  'evidence.uploaded': { label: 'Evidence', Icon: Upload, tone: 'soot' },
  'stage.started': { label: 'Stage', Icon: Play, tone: 'ink' },
  'stage.completed': { label: 'Stage done', Icon: SquareCheck, tone: 'ink' },
  'agent.started': { label: 'Agent', Icon: Play, tone: 'soot' },
  'agent.completed': { label: 'Agent done', Icon: SquareCheck, tone: 'soot' },
  'model.call': { label: 'Model', Icon: BrainCircuit, tone: 'ink' },
  'tool.call': { label: 'Tool', Icon: Wrench, tone: 'turmeric' },
  'interview.started': { label: 'Interview', Icon: Mic, tone: 'soot' },
  'interview.completed': { label: 'Interview done', Icon: Mic, tone: 'soot' },
  'copilot.question': { label: 'Copilot', Icon: MessagesSquare, tone: 'ink' },
  'decision.made': { label: 'Decision', Icon: Gavel, tone: 'leaf' },
  'guardrail.blocked': { label: 'Guardrail', Icon: ShieldAlert, tone: 'chili' },
}

const FILTERS = [
  { v: 'all', label: 'All' },
  { v: 'model', label: 'Model calls' },
  { v: 'tool', label: 'Tools' },
  { v: 'agent', label: 'Agents' },
  { v: 'guard', label: 'Guardrails' },
] as const
type Filter = (typeof FILTERS)[number]['v']

function match(e: RunEvent, f: Filter) {
  if (f === 'all') return e.type !== 'agent.started' // the completion row carries the timing

  if (f === 'model') return e.type === 'model.call'
  if (f === 'tool') return e.type === 'tool.call'
  if (f === 'agent') return e.type.startsWith('agent.') || e.type.startsWith('stage.')
  return e.type === 'guardrail.blocked' || e.status !== 'ok'
}

const TONE_TEXT = { ink: 'text-ink', turmeric: 'text-turmeric-deep', leaf: 'text-leaf-ink', chili: 'text-chili-ink', soot: 'text-soot-2' }

const STAGE_NAME: Record<string, string> = { extract: 'Reading the evidence', assess: 'Assessing the case', interview: 'Interview' }

function StageRow({ e }: { e: RunEvent }) {
  const t = new Date(e.ts)
  const opening = e.type === 'stage.started' || e.type === 'interview.started'
  const key = e.agent || e.detail
  const name = e.type.startsWith('interview') ? 'Voice interview' : (STAGE_NAME[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Stage'))
  if (!opening)
    return (
      <li className="flex items-center justify-end gap-2 border-b border-ink/20 pb-1.5 pt-1">
        <span className="font-hand text-[14px] text-soot-2">
          {name.toLowerCase()} · done in {fmtDuration(e.latency_ms ?? 0)}
        </span>
        <SquareCheck size={13} className="text-leaf" aria-hidden />
      </li>
    )
  return (
    <li className="flex items-end gap-3 pb-1.5 pt-6">
      <span className="font-mono tnum w-[62px] shrink-0 pl-1 text-[11px] text-soot-3">{Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      <span className="font-display text-[19px] leading-none text-ink">{name}</span>
      {e.model ? <span className="font-mono rounded bg-ink/8 px-1 text-[10.5px] text-ink-soft">{e.model}</span> : null}
      <span className="mb-1 h-px flex-1 bg-ink/25" aria-hidden />
    </li>
  )
}

function Row({ e, maxLatency }: { e: RunEvent; maxLatency: number }) {
  if (e.type.startsWith('stage.') || e.type.startsWith('interview.')) return <StageRow e={e} />
  const k = KIND[e.type] ?? { label: e.type, Icon: KeyRound, tone: 'soot' as const }
  const t = new Date(e.ts)
  const actor = (e.agent ?? '').replace(/_/g, ' ')
  return (
    <li className="grid grid-cols-[62px_104px_minmax(0,1fr)_118px_84px_66px] items-center gap-x-3 border-b border-[color:var(--rule-color)] py-2 pr-1">
      <span className="font-mono tnum pl-1 text-[11px] text-soot-3">{Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      <span className={`flex items-center gap-1.5 text-[11.5px] font-extrabold ${TONE_TEXT[k.tone]}`}>
        <k.Icon size={13} aria-hidden /> {k.label}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          {actor ? <span className="truncate text-[12.5px] font-extrabold capitalize text-soot">{actor}</span> : null}
          {e.tool ? <span className="font-mono shrink-0 rounded bg-turmeric/25 px-1 text-[10.5px] text-soot">{e.tool}</span> : null}
          {e.model ? <span className="font-mono shrink-0 rounded bg-ink/8 px-1 text-[10.5px] text-ink-soft">{e.model}</span> : null}
          {e.status === 'blocked' ? (
            <Stamp tone="warn" size={9} rotate={-3}>
              blocked
            </Stamp>
          ) : e.status === 'error' ? (
            <Stamp tone="fail" size={9} rotate={-3}>
              error
            </Stamp>
          ) : null}
        </span>
        <span className="block truncate text-[12px] leading-snug text-soot-2" title={e.detail}>
          {e.detail}
        </span>
      </span>
      <span className="flex items-center gap-2">
        {e.latency_ms != null ? (
          <>
            <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-soot/8">
              <span className={`block h-full rounded-full ${e.type === 'model.call' ? 'bg-ink' : e.type === 'tool.call' ? 'bg-turmeric' : 'bg-soot/35'}`} style={{ width: `${Math.max(4, (e.latency_ms / Math.max(1, maxLatency)) * 100)}%` }} />
            </span>
            <span className="font-mono tnum w-[46px] text-right text-[11px] text-soot-2">{fmtDuration(e.latency_ms)}</span>
          </>
        ) : null}
      </span>
      <span className="font-mono tnum text-right text-[11px] text-soot-2">{e.input_tokens != null || e.output_tokens != null ? `${fmtTokens(e.input_tokens ?? 0)} → ${fmtTokens(e.output_tokens ?? 0)}` : ''}</span>
      <span className="font-mono tnum text-right text-[11px] font-bold text-soot">{e.cost_usd != null ? fmtCost(e.cost_usd) : ''}</span>
    </li>
  )
}

/** The run log: an audit ledger of every agent step, model call and tool call for this case. */
export function RunLog({ events, open, onOpenChange, title }: { events: RunEvent[]; open: boolean; onOpenChange: (o: boolean) => void; title: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const tot = useMemo(() => totals(events), [events])
  const shown = events.filter((e) => match(e, filter))
  const maxLatency = Math.max(1, ...events.filter((e) => e.type === 'model.call' || e.type === 'tool.call').map((e) => e.latency_ms ?? 0))
  const stats = [
    { k: 'Model calls', v: String(tot.modelCalls), sub: `${tot.toolCalls} tool calls` },
    { k: 'Tokens', v: fmtTokens(tot.tokensIn + tot.tokensOut), sub: `${fmtTokens(tot.tokensIn)} in · ${fmtTokens(tot.tokensOut)} out` },
    { k: 'Est. cost', v: fmtCost(tot.cost), sub: 'from token counts' },
    { k: 'Wall time', v: fmtDuration(tot.wallMs), sub: `${events.length} events` },
  ]
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-soot/35 backdrop-blur-[1.5px] data-[state=open]:animate-[fade-up_.2s_ease]" />
        <Dialog.Content className="grain fixed inset-y-0 right-0 z-50 flex w-[min(820px,96vw)] flex-col bg-paper shadow-[-30px_0_60px_-30px_rgb(40_25_5/0.6)] data-[state=open]:animate-[fade-up_.25s_var(--ease-ink)]">
          <header className="shrink-0 border-b border-soot/12 px-7 pb-4 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow flex items-center gap-1.5">
                  <ScrollText size={13} aria-hidden /> Run log · audit ledger
                </p>
                <Dialog.Title className="font-display mt-1 text-[28px] leading-tight text-ink">{title}</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13px] text-soot-2">Every agent step, model call and tool call on this case — the same rows written to BigQuery for audit.</Dialog.Description>
              </div>
              <Dialog.Close className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper-2 text-ink hover:bg-paper-3" aria-label="Close run log">
                <X size={20} />
              </Dialog.Close>
            </div>
            <dl className="mt-5 grid grid-cols-4 overflow-hidden rounded-2xl border border-soot/12 bg-card">
              {stats.map((s, i) => (
                <div key={s.k} className={`px-4 py-3 ${i ? 'border-l border-soot/10' : ''}`}>
                  <dt className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-soot-3">{s.k}</dt>
                  <dd className="font-display-tight tnum mt-0.5 text-[28px] leading-none text-ink">{s.v}</dd>
                  <dd className="mt-1 text-[11.5px] text-soot-2">{s.sub}</dd>
                </div>
              ))}
            </dl>
            <ToggleGroup.Root type="single" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} className="mt-4 flex flex-wrap gap-1" aria-label="Filter events">
              {FILTERS.map((f) => (
                <ToggleGroup.Item
                  key={f.v}
                  value={f.v}
                  className="rounded-full border border-soot/15 px-3 py-1 text-[12px] font-bold text-soot-2 data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-paper"
                >
                  {f.label}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
          </header>
          <div className="grid shrink-0 grid-cols-[62px_104px_minmax(0,1fr)_118px_84px_66px] gap-x-3 border-b border-soot/15 bg-paper-2/70 px-7 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-soot-3">
            <span className="pl-1">Time</span>
            <span>Kind</span>
            <span>Who · what</span>
            <span>Latency</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">Cost</span>
          </div>
          <div className="thin-scroll relative min-h-0 flex-1 overflow-y-auto px-7">
            <div className="pointer-events-none absolute bottom-0 left-[94px] top-0 w-[1.5px] bg-margin/50" aria-hidden />
            {shown.length ? (
              <ol>
                {shown.map((e) => (
                  <Row key={e.event_id} e={e} maxLatency={maxLatency} />
                ))}
              </ol>
            ) : (
              <p className="font-hand py-12 text-center text-[18px] text-soot-2">{events.length ? 'Nothing of this kind yet.' : 'The run log fills in as the agents work.'}</p>
            )}
          </div>
          <footer className="shrink-0 border-t border-soot/12 px-7 py-3 text-[11.5px] text-soot-2">
            Cost is estimated from token counts at list prices. Guardrail rows show text that was blocked and rewritten before anyone saw it.
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
