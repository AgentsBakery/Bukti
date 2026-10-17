import { CircleHelp, FileText, NotebookPen, Receipt, ScrollText, Sparkles, Store } from 'lucide-react'
import { Dialog, Tabs } from 'radix-ui'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { Application, Health } from '../api/types'
import { LedgerBook } from '../borrower/LedgerBook'
import { Kawung, KawungLoader } from '../components/Kawung'
import { centerIn } from '../lib/flight'
import { businessName } from '../lib/text'
import { useApplication, usePoll } from '../lib/useApplication'
import { Copilot } from './Copilot'
import { fmtCost, fmtDuration, fmtTokens, RunLog, totals } from './RunLog'
import { AgentGraph } from './AgentGraph'
import { AuditTrail, FactsPanel, ProofChain } from './CaseFile'
import { DecisionPanel } from './DecisionPanel'
import { EvidenceViewer, evidenceShort } from './EvidenceViewer'
import { LinkProvider, useLink } from './link'
import { MemoPanel } from './MemoPanel'
import { MetricsStrip } from './Metrics'

export const STATUS_LABEL: Record<Application['status'], string> = {
  draft: 'Draft',
  extracting: 'Reading',
  extracted: 'Read',
  interviewed: 'Interviewed',
  assessing: 'Assessing',
  ready: 'Ready for review',
  decided: 'Decided',
}

export function StatusPill({ status }: { status: Application['status'] }) {
  const busy = status === 'extracting' || status === 'assessing'
  const tone = status === 'ready' ? 'bg-turmeric/30 text-soot ring-turmeric-deep/40' : status === 'decided' ? 'bg-leaf/15 text-leaf-ink ring-leaf/30' : 'bg-soot/8 text-soot-2 ring-soot/15'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-extrabold ring-1 ${tone}`}>
      {busy ? <Kawung size={11} spin /> : null}
      {STATUS_LABEL[status]}
    </span>
  )
}

let healthCache: Promise<Health> | null = null
function useModels() {
  const [models, setModels] = useState<Record<string, string> | undefined>()
  useEffect(() => {
    healthCache ??= api.health()
    healthCache.then((h) => {
      const m = h.models
      if (m && typeof m === 'object') setModels(Object.fromEntries(Object.entries(m as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>)
    }, () => {})
  }, [])
  return models
}

function ConsoleLedger({ app }: { app: Application }) {
  const { resolved, hover, pin, pinSeq } = useLink()
  const box = useRef<HTMLDivElement>(null)
  const days = useMemo(() => new Map(app.statement.map((d) => [d.date, d])), [app.statement])
  const landed = useMemo(() => new Set([...app.entries.map((e) => e.id), ...app.statement.map((d) => `day:${d.date}`)]), [app.entries, app.statement])
  const rail = app.market === 'ID' ? 'QRIS' : 'UPI'
  useEffect(() => {
    const first = [...resolved.entries][0]
    if (!first || !box.current) return
    const row = box.current.querySelector<HTMLElement>(`[data-row="${first}"]`)
    if (row) centerIn(box.current, row, true)
  }, [pinSeq]) // eslint-disable-line react-hooks/exhaustive-deps
  const sales = app.entries.filter((e) => e.amount_in > 0).length
  return (
    <section className="paper-card flex min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-soot/10 px-3 py-2">
        <h3 className="eyebrow !text-[10.5px]">Digital ledger</h3>
        <span className="font-mono tnum text-[11px] text-soot-3">
          {app.entries.length} lines · {sales} sales · {app.statement.length} {rail} days
        </span>
      </header>
      <div ref={box} data-scroll className="thin-scroll relative min-h-0 flex-1 overflow-y-auto">
        {app.entries.length || app.statement.length ? (
          <LedgerBook
            dense
            entries={app.entries}
            days={days}
            landed={landed}
            market={app.market}
            rail={rail}
            labels={{ matched: 'match', gap: 'gap', none: `no ${rail}`, inCol: 'In', outCol: 'Out' }}
            highlighted={resolved.entries}
            highlightDates={resolved.days}
            onSelect={(id) => pin([id], 'ledger')}
            onHover={(id) => hover(id ? [id] : null, 'ledger')}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-[13px] text-soot-3">
            {app.status === 'extracting' ? <KawungLoader size={30} label="Gemini is reading the notebook…" /> : 'Lines appear here once the notebook is read.'}
          </div>
        )}
      </div>
    </section>
  )
}

function EvidenceTray({ app, viewEv, setViewEv }: { app: Application; viewEv: string | null; setViewEv: (id: string) => void }) {
  const { resolved } = useLink()
  const icon = { ledger: NotebookPen, statement: FileText, receipt: Receipt, shop: Store }
  const entryEv = new Set([...resolved.entries].map((id) => app.entries.find((e) => e.id === id)?.evidence_id))
  return (
    <section className="paper-card px-3 pb-3 pt-2.5">
      <h3 className="eyebrow mb-2 !text-[10.5px]">Evidence</h3>
      <div className="grid grid-cols-3 gap-2">
        {app.evidence.map((e, i) => {
          const Icon = icon[e.type]
          const lit = resolved.evidence.has(e.id) || entryEv.has(e.id)
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setViewEv(e.id)}
              className={`group relative overflow-hidden rounded-lg bg-paper-3 ring-2 transition ${viewEv === e.id ? 'ring-ink' : lit ? 'ring-turmeric' : 'ring-transparent hover:ring-soot/30'}`}
              title={`${e.label} (${i + 1})`}
            >
              <img src={e.url} alt="" className="aspect-[3/4] w-full object-cover object-top" />
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-[10.5px] font-bold text-white">
                <Icon size={11} aria-hidden /> {evidenceShort(app, e)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

const SHORTCUTS: [string, string][] = [
  ['A', 'Approve the memo amount'],
  ['J', 'Approve the adjusted (slider) amount'],
  ['D', 'Decline, with a note for the borrower'],
  ['1–9', 'Show evidence photo n'],
  ['+ / − / 0', 'Zoom in / out / fit'],
  ['[ / ]', 'Previous / next application'],
  ['Esc', 'Clear the highlight'],
  ['/', 'Ask the copilot about this case'],
  ['L', 'Open the run log'],
  ['?', 'This help'],
]

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-soot/40 backdrop-blur-[2px]" />
        <Dialog.Content className="paper-card grain fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 p-6 data-[state=open]:animate-[fade-up_.2s_ease]">
          <Dialog.Title className="font-display text-[24px] text-ink">Keyboard</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13px] text-soot-2">
            Hover or click any reason, check, figure or chart day to light up its proof on the photo. Click a highlight on the photo to find its ledger row.
          </Dialog.Description>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded-md border border-soot/25 bg-paper px-1.5 py-0.5 font-mono text-[12px] font-bold text-ink shadow-[0_2px_0_rgb(43_38_32/0.15)]">{k}</kbd>
                </dt>
                <dd className="text-[14px] text-soot">{v}</dd>
              </div>
            ))}
          </dl>
          <Dialog.Close className="btn-paper mt-6 w-full !min-h-[46px]">Got it</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Body({ app, replace, compact, onPrevNext, help, setHelp, left }: { app: Application; replace: (a: Application) => void; compact: boolean; onPrevNext?: (d: -1 | 1) => void; help: boolean; setHelp: (b: boolean) => void; left?: ReactNode }) {
  const models = useModels()
  const { clear } = useLink()
  const [tab, setTab] = useState<'case' | 'ask'>('case')
  const [logOpen, setLogOpen] = useState(false)
  const events = usePoll(() => api.listEvents(app.id), 2000, [app.id]) ?? []
  const tot = totals(events)
  const [viewEv, setViewEv] = useState<string | null>(app.evidence[0]?.id ?? null)
  useEffect(() => {
    if (!viewEv && app.evidence[0]) setViewEv(app.evidence[0].id)
  }, [app.evidence, viewEv])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"], [data-borrower]')) return
      if (document.querySelector('[role="dialog"]')) return
      const k = e.key
      if (k === '?') {
        e.preventDefault()
        setHelp(true)
      } else if (k === '/') {
        e.preventDefault()
        setTab('ask')
        window.setTimeout(() => document.getElementById('copilot-input')?.focus(), 30)
      } else if (k === 'l' || k === 'L') setLogOpen(true)
      else if (k === 'Escape') clear()
      else if (k === 'a' || k === 'A') window.dispatchEvent(new CustomEvent('bukti:decide', { detail: 'approve' }))
      else if (k === 'j' || k === 'J') window.dispatchEvent(new CustomEvent('bukti:decide', { detail: 'adjust' }))
      else if (k === 'd' || k === 'D') window.dispatchEvent(new CustomEvent('bukti:decide', { detail: 'decline' }))
      else if (/^[1-9]$/.test(k) && app.evidence[Number(k) - 1]) setViewEv(app.evidence[Number(k) - 1].id)
      else if (k === '+' || k === '=') window.dispatchEvent(new CustomEvent('bukti:zoom', { detail: 'in' }))
      else if (k === '-' || k === '_') window.dispatchEvent(new CustomEvent('bukti:zoom', { detail: 'out' }))
      else if (k === '0') window.dispatchEvent(new CustomEvent('bukti:zoom', { detail: 'fit' }))
      else if (k === '[' && onPrevNext) onPrevNext(-1)
      else if (k === ']' && onPrevNext) onPrevNext(1)
      else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app.evidence, clear, onPrevNext, setHelp])

  return (
    <div
      className={`grid min-h-0 flex-1 gap-3 ${
        compact ? 'grid-cols-[minmax(0,1fr)_minmax(400px,470px)]' : left ? 'grid-cols-[250px_minmax(0,1fr)_minmax(430px,520px)] max-[1500px]:grid-cols-[minmax(0,1fr)_minmax(420px,480px)]' : 'grid-cols-[minmax(0,1fr)_minmax(440px,540px)]'
      }`}
    >
      {left ? (
        <aside className="flex min-h-0 flex-col gap-3 max-[1500px]:hidden">
          <div className="min-h-0 flex-1">{left}</div>
          <EvidenceTray app={app} viewEv={viewEv} setViewEv={setViewEv} />
        </aside>
      ) : null}
      {/* centre: pipeline · photo + ledger · metrics */}
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <section className="paper-card shrink-0 px-3 pb-2.5 pt-2" aria-label="Agent pipeline">
          <div className="mb-1.5 flex items-center justify-between gap-2 pl-1">
            <span className="eyebrow !text-[10.5px]">Agent pipeline</span>
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1 text-[11.5px] font-bold text-soot-2 transition-colors hover:bg-paper-2 hover:text-ink"
              aria-keyshortcuts="L"
            >
              {events.length ? (
                <span className="font-mono tnum hidden xl:inline">
                  {tot.modelCalls} model calls · {fmtTokens(tot.tokensIn + tot.tokensOut)} tokens · {fmtCost(tot.cost)} · {fmtDuration(tot.wallMs)}
                </span>
              ) : null}
              <span className="flex items-center gap-1 rounded-md border border-ink/25 px-1.5 py-0.5 text-ink group-hover:border-ink">
                <ScrollText size={13} aria-hidden /> Run log
              </span>
            </button>
          </div>
          <AgentGraph app={app} models={models} />
        </section>
        <div className={`grid min-h-0 flex-1 gap-3 ${compact ? 'grid-cols-[minmax(0,1.15fr)_minmax(270px,0.85fr)]' : 'grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]'}`}>
          <EvidenceViewer app={app} viewEv={viewEv} setViewEv={setViewEv} />
          <ConsoleLedger app={app} />
        </div>
        <div className="shrink-0">
          <MetricsStrip app={app} />
        </div>
      </div>
      {/* right: the case file + decision */}
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as 'case' | 'ask')} className="flex min-h-0 flex-1 flex-col gap-2">
          <Tabs.List className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-paper/70 p-1 shadow-sm ring-1 ring-soot/10" aria-label="Case file or copilot">
            <Tabs.Trigger
              value="case"
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-extrabold text-soot-2 transition-colors data-[state=active]:bg-ink data-[state=active]:text-paper"
            >
              <FileText size={14} aria-hidden /> Case file
            </Tabs.Trigger>
            <Tabs.Trigger
              value="ask"
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-extrabold text-soot-2 transition-colors data-[state=active]:bg-ink data-[state=active]:text-paper"
            >
              <Sparkles size={14} aria-hidden /> Ask about this case <kbd className="font-mono text-[10px] opacity-60">/</kbd>
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="case" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <div data-scroll className="thin-scroll h-full space-y-5 overflow-y-auto rounded-[16px] pr-1">
              <MemoPanel app={app} />
              <ProofChain app={app} />
              <FactsPanel app={app} />
              <AuditTrail app={app} />
              <div className="h-2" />
            </div>
          </Tabs.Content>
          <Tabs.Content value="ask" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <Copilot app={app} model={[...events].reverse().find((e) => e.agent === 'copilot' && e.type === 'model.call')?.model ?? models?.copilot} />
          </Tabs.Content>
        </Tabs.Root>
        <div className="shrink-0">
          <DecisionPanel app={app} onDecided={replace} />
        </div>
      </div>
      <HelpDialog open={help} onOpenChange={setHelp} />
      <RunLog events={events} open={logOpen} onOpenChange={setLogOpen} title={app.persona.name} />
    </div>
  )
}

/** The officer console for one application. `compact` drops chrome for the split demo view. */
export function ConsoleView({ appId, compact = false, onPrevNext, left }: { appId: string; compact?: boolean; onPrevNext?: (d: -1 | 1) => void; left?: ReactNode }) {
  const { app, error, replace } = useApplication(appId, 1500)
  const [help, setHelp] = useState(false)
  if (!app)
    return (
      <div className="grid flex-1 place-items-center">
        {error ? <p className="font-display text-[20px] text-ink">Application not found.</p> : <KawungLoader size={40} label="Opening the case file…" />}
      </div>
    )
  return (
    <LinkProvider app={app}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="font-display truncate text-[24px] leading-none text-ink">{app.persona.name}</h1>
            <span className="truncate text-[13px] font-bold text-soot">
              {businessName(app.persona)} · {app.persona.city} · {app.market === 'ID' ? 'Indonesia' : 'India'} · {app.language === 'ta' ? 'Tamil' : app.language === 'id' ? 'Bahasa' : 'English'}
            </span>
            <StatusPill status={app.status} />
          </div>
          <button type="button" onClick={() => setHelp(true)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] font-bold text-soot-2 hover:bg-card/60 hover:text-ink" aria-label="Keyboard shortcuts">
            <CircleHelp size={15} aria-hidden /> Shortcuts <kbd className="font-mono text-[10.5px]">?</kbd>
          </button>
        </div>
        <Body app={app} replace={replace} compact={compact} onPrevNext={onPrevNext} help={help} setHelp={setHelp} left={left} />
      </div>
    </LinkProvider>
  )
}
