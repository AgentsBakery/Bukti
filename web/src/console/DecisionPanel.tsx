import { Check, Scale, SlidersHorizontal, X } from 'lucide-react'
import { Dialog, Slider } from 'radix-ui'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Application, DecisionAction } from '../api/types'
import { Stamp } from '../components/Stamp'
import { affordability } from '../lib/afford'
import { fmtDateTime, money, pct } from '../lib/format'

const NOT_USED = ['gender', 'religion', 'ethnicity', 'marital status', 'age']

const ACTION: Record<DecisionAction, { label: string; key: string; cls: string; verb: string }> = {
  approve: { label: 'Approve', key: 'A', cls: 'bg-leaf text-paper hover:bg-leaf-ink', verb: 'Approve' },
  adjust: { label: 'Adjust', key: 'J', cls: 'bg-ink text-paper hover:bg-ink-2', verb: 'Approve an adjusted amount of' },
  decline: { label: 'Decline', key: 'D', cls: 'border-2 border-chili text-chili-ink bg-card hover:bg-chili/8', verb: 'Decline' },
}

export function DecisionPanel({ app, onDecided }: { app: Application; onDecided: (a: Application) => void }) {
  const memo = app.memo
  const step = app.market === 'ID' ? 100_000 : 500
  const proposed = memo?.amount ?? 0
  const max = useMemo(() => {
    const base = proposed > 0 ? proposed * 2 : Math.max((app.metrics?.verified_monthly_sales ?? 0) * 0.5, step * 20)
    return Math.ceil(base / step) * step
  }, [proposed, app.metrics, step])
  const [amount, setAmount] = useState(app.decision?.amount || proposed)
  const [confirm, setConfirm] = useState<DecisionAction | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setAmount(app.decision?.amount || proposed)
  }, [proposed, app.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // live affordability, week by week, from the memo's own cash-flow-shaped schedule
  const aff = affordability(app, amount)
  const { weeklyNet, avg: avgInst, peak: peakInst, share, tenor } = aff
  const tone = share <= 0.3 ? 'leaf' : share <= 0.4 ? 'turmeric' : 'chili'

  const can = (a: DecisionAction) => !!memo && !busy && (a !== 'approve' || proposed > 0) && (a !== 'adjust' || amount > 0)

  useEffect(() => {
    const on = (e: Event) => {
      const a = (e as CustomEvent<DecisionAction>).detail
      if (can(a)) setConfirm(a)
    }
    window.addEventListener('bukti:decide', on)
    return () => window.removeEventListener('bukti:decide', on)
  })

  const submit = async () => {
    if (!confirm) return
    setBusy(true)
    setErr(null)
    try {
      const body = confirm === 'decline' ? { action: confirm, note } : { action: confirm, amount: confirm === 'approve' ? proposed : amount, note }
      const a = await api.decide(app.id, body)
      onDecided(a)
      setConfirm(null)
      setNote('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmAmount = confirm === 'approve' ? proposed : amount

  return (
    <section className="paper-card relative px-4 pb-3.5 pt-3" aria-label="Decision">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5">
            <Scale size={13} aria-hidden /> Officer decision
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-soot-2">
            <span className="font-bold">Not used:</span>
            {NOT_USED.map((x) => (
              <span key={x} className="rounded-full border border-soot/15 px-1.5 py-[1px] text-[10.5px] text-soot-3 line-through decoration-soot/40">
                {x}
              </span>
            ))}
          </p>
        </div>
        {app.decision ? (
          <div className="shrink-0 text-right">
            <Stamp tone={app.decision.action === 'decline' ? 'fail' : 'pass'} rotate={-6} size={12} land>
              {app.decision.action === 'decline' ? 'Declined' : app.decision.action === 'adjust' ? 'Adjusted' : 'Approved'}
            </Stamp>
            <p className="mt-1 text-[10.5px] text-soot-3">
              {app.decision.officer} · {fmtDateTime(app.decision.ts)}
            </p>
          </div>
        ) : null}
      </div>

      <div className={`mt-3 ${memo ? '' : 'pointer-events-none opacity-45'}`}>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="amount-slider" className="flex items-center gap-1.5 text-[12px] font-bold text-soot-2">
            <SlidersHorizontal size={13} aria-hidden /> Amount
          </label>
          <span className="font-display-tight tnum text-[24px] font-semibold leading-none text-ink">{money(amount, app.market)}</span>
        </div>
        <Slider.Root
          id="amount-slider"
          className="relative mt-2 flex h-6 w-full touch-none select-none items-center"
          min={0}
          max={max}
          step={step}
          value={[amount]}
          onValueChange={([v]) => setAmount(v)}
          aria-label="Loan amount"
        >
          <Slider.Track className="relative h-[6px] grow overflow-hidden rounded-full bg-soot/12">
            <Slider.Range className="absolute h-full rounded-full bg-ink" />
          </Slider.Track>
          {proposed > 0 ? (
            <span className="pointer-events-none absolute top-[-3px] h-[30px] w-[2px] rounded bg-turmeric-deep" style={{ left: `${(proposed / max) * 100}%` }} title="Memo proposal" aria-hidden />
          ) : null}
          <Slider.Thumb className="block h-[22px] w-[22px] rounded-full border-[3px] border-ink bg-paper shadow-md focus-visible:outline-offset-2" />
        </Slider.Root>
        <div className="mt-1 flex justify-between text-[10.5px] text-soot-3">
          <span>0</span>
          {proposed > 0 ? <span className="text-turmeric-deep">memo {money(proposed, app.market)}</span> : <span>no amount proposed</span>}
          <span>{money(max, app.market)}</span>
        </div>
        <div className="mt-2 rounded-xl bg-paper-2/70 px-3 py-2">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-soot-2">
              Peak installment <b className="font-mono tnum text-soot">{money(Math.round(peakInst), app.market)}</b>
              <span className="text-soot-3"> · avg {money(Math.round(avgInst), app.market)}/wk</span>
            </span>
            <span className={`font-mono tnum font-bold ${tone === 'leaf' ? 'text-leaf-ink' : tone === 'turmeric' ? 'text-turmeric-deep' : 'text-chili-ink'}`}>
              {weeklyNet ? `${pct(share)} of that week’s net` : '—'}
            </span>
          </div>
          <div className="relative mt-1.5 h-[7px] rounded-full bg-soot/10">
            <div
              className="h-full rounded-full transition-[width,background] duration-300"
              style={{ width: `${Math.min(100, (share / 0.6) * 100)}%`, background: `var(--color-${tone === 'turmeric' ? 'turmeric' : tone})` }}
            />
            <span className="absolute -top-[3px] h-[13px] w-[2px] bg-soot/60" style={{ left: '50%' }} aria-hidden />
          </div>
          <p className="mt-1 text-right text-[10px] text-soot-3">policy limit 30% of verified weekly net cash</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['approve', 'adjust', 'decline'] as DecisionAction[]).map((a) => (
          <button
            key={a}
            type="button"
            disabled={!can(a)}
            onClick={() => setConfirm(a)}
            className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-[14px] font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ACTION[a].cls}`}
            aria-keyshortcuts={ACTION[a].key}
          >
            {ACTION[a].label}
            <kbd className="rounded border border-current/30 px-1 font-mono text-[10px] opacity-75">{ACTION[a].key}</kbd>
          </button>
        ))}
      </div>
      {!memo ? <p className="mt-2 text-center text-[11.5px] text-soot-3">Decision opens when the memo is ready.</p> : null}

      <Dialog.Root open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-soot/40 backdrop-blur-[2px]" />
          <Dialog.Content
            className="paper-card grain fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 p-5 data-[state=open]:animate-[fade-up_.2s_ease]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
          >
            {confirm ? (
              <>
                <Dialog.Title className="font-display text-[22px] leading-snug text-ink">
                  {ACTION[confirm].verb} {confirm !== 'decline' ? money(confirmAmount, app.market) : 'this application'}
                  {confirm !== 'decline' ? ` for ${app.persona.name}?` : '?'}
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-[13.5px] leading-snug text-soot-2">
                  {confirm === 'decline'
                    ? 'The borrower will see a path forward, not a dead end. Add a note they can act on.'
                    : `${tenor} weekly installments shaped to the shop’s cash pattern. Peak ${pct(share)} of weekly net cash.`}
                </Dialog.Description>
                <label className="mt-4 flex justify-between text-[12px] font-bold text-soot-2" htmlFor="decision-note">
                  <span>Note {confirm === 'decline' ? '(shown to the borrower)' : '(optional)'}</span>
                  <span className="font-normal text-soot-3">Shift+↵ for a new line</span>
                </label>
                <textarea
                  id="decision-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  autoFocus
                  className="mt-1 w-full resize-none rounded-xl border border-soot/20 bg-paper px-3 py-2 text-[14px] text-soot outline-none focus:border-ink"
                  placeholder={confirm === 'decline' ? 'e.g. Let’s visit the shop and look at the notebook together.' : 'e.g. Verified on site.'}
                />
                {err ? <p className="mt-2 text-[13px] font-bold text-chili-ink">{err}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <Dialog.Close className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-[14px] font-bold text-soot-2 hover:bg-paper-2">
                    <X size={16} aria-hidden /> Cancel <kbd className="font-mono text-[10px] opacity-60">Esc</kbd>
                  </Dialog.Close>
                  <button type="button" onClick={() => void submit()} disabled={busy} className={`flex h-11 items-center gap-1.5 rounded-xl px-4 text-[14px] font-extrabold ${ACTION[confirm].cls}`}>
                    <Check size={16} aria-hidden /> {busy ? 'Saving…' : `Confirm ${ACTION[confirm].label.toLowerCase()}`} <kbd className="font-mono text-[10px] opacity-70">↵</kbd>
                  </button>
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
