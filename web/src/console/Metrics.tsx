import { ToggleGroup } from 'radix-ui'
import { useMemo, useState } from 'react'
import type { Application, Metrics } from '../api/types'
import { fmtDate, money, moneyShort, parseISODate, pct } from '../lib/format'
import { useLink, useLinkable } from './link'

function Panel({ title, aside, children, className = '' }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`paper-card flex min-w-0 flex-col px-3.5 pb-3 pt-2.5 ${className}`}>
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="eyebrow !text-[10.5px]">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  )
}

function correlation(a: number[], b: number[]) {
  const n = a.length
  if (n < 3) return 0
  const ma = a.reduce((s, x) => s + x, 0) / n
  const mb = b.reduce((s, x) => s + x, 0) / n
  let sab = 0, saa = 0, sbb = 0
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb)
    saa += (a[i] - ma) ** 2
    sbb += (b[i] - mb) ** 2
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0
}

function Totals({ app, m }: { app: Application; m: Metrics }) {
  const rail = app.market === 'ID' ? 'QRIS' : 'UPI'
  const max = Math.max(m.ledger_sales_total, m.statement_total, m.ledger_purchases_total, 1)
  const sales = app.entries.filter((e) => e.amount_in > 0).map((e) => e.id)
  const buys = app.entries.filter((e) => e.amount_out > 0).map((e) => e.id)
  const stmt = app.evidence.filter((e) => e.type === 'statement').map((e) => e.id)
  const rows = [
    { label: 'Notebook sales', v: m.ledger_sales_total, color: 'var(--color-ink)', refs: sales },
    { label: `${rail} received`, v: m.statement_total, color: 'var(--color-leaf)', refs: stmt },
    { label: 'Notebook purchases', v: m.ledger_purchases_total, color: 'var(--color-chili)', refs: buys },
  ]
  return (
    <Panel title="Notebook vs statement">
      <div className="space-y-2">
        {rows.map((r) => (
          <TotalsRow key={r.label} {...r} max={max} market={app.market} />
        ))}
      </div>
      <p className="mt-auto pt-2 text-[11.5px] leading-snug text-soot-2">
        Verified monthly sales <b className="font-mono tnum text-soot">{money(m.verified_monthly_sales, app.market)}</b> · net cash{' '}
        <b className="font-mono tnum text-soot">{money(m.net_monthly_cashflow, app.market)}</b>/mo
      </p>
    </Panel>
  )
}

function TotalsRow({ label, v, color, refs, max, market }: { label: string; v: number; color: string; refs: string[]; max: number; market: Application['market'] }) {
  const link = useLinkable(refs, 'metric')
  return (
    <button type="button" {...link} className="block w-full rounded-md text-left hover:bg-paper-2/70">
      <div className="flex items-baseline justify-between text-[11.5px]">
        <span className="font-bold text-soot-2">{label}</span>
        <span className="font-mono tnum text-[12.5px] font-bold text-soot">{money(v, market)}</span>
      </div>
      <div className="mt-0.5 h-[7px] rounded-full bg-soot/8">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(v / max) * 100}%`, background: color }} />
      </div>
    </button>
  )
}

function ShareBand({ app, m }: { app: Application; m: Metrics }) {
  const rail = app.market === 'ID' ? 'QRIS' : 'UPI'
  const [lo, hi] = m.peer_share_band
  const s = m.digital_share
  const inBand = s >= lo && s <= hi
  const maxX = Math.max(1, hi * 1.25, s * 1.1)
  const x = (v: number) => `${(v / maxX) * 100}%`
  const link = useLinkable(['chk_share', ...app.evidence.filter((e) => e.type === 'statement').map((e) => e.id)], 'metric')
  return (
    <Panel title={`${rail} share vs peers`}>
      <button type="button" {...link} className="block w-full rounded-md pb-1 pt-1 text-left hover:bg-paper-2/60">
        <div className="flex items-baseline gap-2">
          <span className={`font-display tnum text-[30px] leading-none ${inBand ? 'text-leaf-ink' : 'text-chili-ink'}`}>{pct(s)}</span>
          <span className="text-[11.5px] leading-tight text-soot-2">
            of notebook sales
            <br />
            arrived by {rail}
          </span>
        </div>
        <div className="relative mt-4 h-[26px]">
          <div className="absolute inset-x-0 top-[11px] h-[4px] rounded-full bg-soot/10" />
          <div className="absolute top-[4px] h-[18px] rounded-[5px] bg-turmeric/45 ring-1 ring-turmeric-deep/40" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
          <div className="absolute -translate-x-1/2" style={{ left: x(s), top: 0 }}>
            <svg width="16" height="26" viewBox="0 0 16 26" aria-hidden>
              <path d="M8 1 L15 9 L8 17 L1 9 Z" fill={inBand ? 'var(--color-leaf)' : 'var(--color-chili)'} stroke="var(--color-card)" strokeWidth="1.5" />
              <line x1="8" y1="17" x2="8" y2="26" stroke={inBand ? 'var(--color-leaf)' : 'var(--color-chili)'} strokeWidth="2" />
            </svg>
          </div>
        </div>
        <div className="relative mt-0.5 h-4 text-[10.5px] text-soot-3">
          <span className="absolute -translate-x-1/2" style={{ left: x(lo) }}>
            {pct(lo)}
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: x(hi) }}>
            {pct(hi)}
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-soot-2">
          Peer band (p25–p75) for similar shops. Peer median <b className="font-mono tnum">{moneyShort(m.peer_median_daily_sales, app.market)}</b>/day.
        </p>
      </button>
    </Panel>
  )
}

function DailyOverlay({ app, m }: { app: Application; m: Metrics }) {
  const [mode, setMode] = useState<'shape' | 'amount'>('shape')
  const { hover, pin, resolved } = useLink()
  const rail = app.market === 'ID' ? 'QRIS' : 'UPI'
  const W = 520
  const H = 128
  const P = { l: 6, r: 6, t: 8, b: 16 }
  const d = m.daily
  const { L, S, r } = useMemo(() => {
    const led = d.map((x) => x.ledger)
    const st = d.map((x) => x.statement)
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length) || 1
    if (mode === 'shape') {
      const ml = mean(led)
      const ms = mean(st)
      return { L: led.map((v) => v / ml), S: st.map((v) => v / ms), r: correlation(led, st) }
    }
    return { L: led, S: st, r: correlation(led, st) }
  }, [d, mode])
  const maxY = Math.max(...L, ...S, mode === 'shape' ? 1.6 : 1) * 1.08
  const X = (i: number) => P.l + (i / Math.max(1, d.length - 1)) * (W - P.l - P.r)
  const Y = (v: number) => P.t + (1 - v / maxY) * (H - P.t - P.b)
  const line = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')
  const linkedDates = new Set([...resolved.days, ...app.entries.filter((e) => resolved.entries.has(e.id)).map((e) => e.date)])
  const good = r >= 0.6

  return (
    <Panel
      title="Daily: notebook vs statement"
      className="min-w-[300px]"
      aside={
        <ToggleGroup.Root type="single" value={mode} onValueChange={(v) => v && setMode(v as 'shape' | 'amount')} className="flex rounded-lg bg-paper-2 p-0.5 text-[11px] font-bold" aria-label="Chart scale">
          {(['shape', 'amount'] as const).map((k) => (
            <ToggleGroup.Item key={k} value={k} className="rounded-md px-2 py-0.5 text-soot-2 data-[state=on]:bg-card data-[state=on]:text-ink data-[state=on]:shadow-sm">
              {k === 'shape' ? 'Shape' : 'Amount'}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Daily notebook sales against ${rail} totals, correlation ${r.toFixed(2)}`}>
        {mode === 'shape' ? <line x1={P.l} x2={W - P.r} y1={Y(1)} y2={Y(1)} stroke="rgb(43 38 32 / .18)" strokeDasharray="3 4" /> : null}
        {d.map((x, i) =>
          x.statement === 0 && x.ledger > 0 ? (
            <g key={`z${i}`}>
              <rect x={X(i) - 6} y={P.t} width={12} height={H - P.t - P.b} fill="var(--color-chili)" opacity={0.12} rx={3} />
              <path d={`M ${X(i) - 4} ${H - P.b + 3} l 8 8 m 0 -8 l -8 8`} stroke="var(--color-chili)" strokeWidth={2} strokeLinecap="round" />
            </g>
          ) : null,
        )}
        {d.map((x, i) =>
          linkedDates.has(x.date) ? <rect key={`h${i}`} x={X(i) - 6} y={P.t} width={12} height={H - P.t - P.b} fill="var(--color-turmeric)" opacity={0.35} rx={3} /> : null,
        )}
        <path d={line(S)} fill="none" stroke="var(--color-leaf)" strokeWidth={2.2} strokeLinejoin="round" />
        <path d={line(L)} fill="none" stroke="var(--color-ink)" strokeWidth={2.2} strokeLinejoin="round" />
        {S.map((v, i) => (
          <circle key={i} cx={X(i)} cy={Y(v)} r={2.2} fill="var(--color-leaf)" />
        ))}
        {d.map((x, i) => (
          <rect
            key={`t${i}`}
            x={X(i) - (W / d.length) / 2}
            y={0}
            width={W / d.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => hover([`day:${x.date}`], 'metric')}
            onMouseLeave={() => hover(null)}
            onClick={() => pin([`day:${x.date}`], 'metric')}
            style={{ cursor: 'pointer' }}
          >
            <title>
              {fmtDate(x.date, 'en', { day: 'numeric', month: 'short' }, app.market)} — notebook {money(x.ledger, app.market)}, {rail} {money(x.statement, app.market)}
            </title>
          </rect>
        ))}
        {[0, Math.floor(d.length / 2), d.length - 1].map((i) =>
          d[i] ? (
            <text key={`l${i}`} x={X(i)} y={H - 2} textAnchor={i === 0 ? 'start' : i === d.length - 1 ? 'end' : 'middle'} fontSize={9.5} fill="var(--color-soot-3)">
              {parseISODate(d[i].date).getDate()}/{parseISODate(d[i].date).getMonth() + 1}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-3 text-soot-2">
          <span className="flex items-center gap-1">
            <i className="inline-block h-[3px] w-3.5 rounded bg-ink" /> Notebook
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-[3px] w-3.5 rounded bg-leaf" /> {rail}
          </span>
        </span>
        <span className={`font-mono tnum font-bold ${good ? 'text-leaf-ink' : 'text-chili-ink'}`}>
          r = {r.toFixed(2)} {good ? '· moves together' : '· decoupled'}
        </span>
      </div>
    </Panel>
  )
}

export function MetricsStrip({ app }: { app: Application }) {
  const m = app.metrics
  if (!m)
    return (
      <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-3">
        {['Notebook vs statement', 'Share vs peers', 'Daily: notebook vs statement'].map((t) => (
          <div key={t} className="paper-card flex h-[160px] flex-col px-3.5 py-2.5">
            <span className="eyebrow !text-[10.5px]">{t}</span>
            <span className="m-auto text-[12.5px] text-soot-3">Waiting for the reconciler…</span>
          </div>
        ))}
      </div>
    )
  return (
    <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-3">
      <Totals app={app} m={m} />
      <ShareBand app={app} m={m} />
      <DailyOverlay app={app} m={m} />
    </div>
  )
}
