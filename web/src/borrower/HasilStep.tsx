import { Check, Headphones, Lightbulb, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { AgentName, Application, Memo, ScheduleItem, StepStatus } from '../api/types'
import { Kawung, KawungLoader } from '../components/Kawung'
import { Stamp } from '../components/Stamp'
import type { StringKey } from '../i18n/strings'
import { affordability } from '../lib/afford'
import { fmtDate, money, moneyRange, pct, shortName } from '../lib/format'
import { useSpeech } from '../lib/speech'
import { getStream, isStreaming, startStream, subscribeStream } from '../lib/streams'
import { CoinCalendar } from './CoinCalendar'
import { useBorrower } from './context'

const STEPS: { agent: AgentName; key: StringKey }[] = [
  { agent: 'reconciler', key: 'a_reconciler' },
  { agent: 'integrity', key: 'a_integrity' },
  { agent: 'benchmark', key: 'a_benchmark' },
  { agent: 'policy', key: 'a_policy' },
  { agent: 'memo', key: 'a_memo' },
]

const ease = [0.22, 0.8, 0.24, 1] as const
const rise = (delay: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease, delay } })

function Progress() {
  const { app, t } = useBorrower()
  const [status, setStatus] = useState<Partial<Record<AgentName, StepStatus>>>({})
  useEffect(() => {
    return subscribeStream('assess', app.id, (e) => {
      if (e.type === 'agent') setStatus((s) => ({ ...s, [e.agent]: e.status }))
    })
  }, [app.id])
  const stateOf = (a: AgentName): StepStatus => status[a] ?? app.agent_trace.find((s) => s.agent === a)?.status ?? 'pending'
  return (
    <div className="flex flex-col items-center px-6 pb-8 pt-6">
      <div className="relative grid h-[150px] w-[150px] place-items-center">
        <div className="kawung-band absolute inset-0 rounded-full" style={{ opacity: 0.1 }} />
        <Kawung size={120} stroke="var(--color-ink)" spin className="absolute opacity-25" />
        <Kawung size={74} spin style={{ animationDirection: 'reverse', animationDuration: '6s' }} />
      </div>
      <p className="font-display mt-4 text-center text-[22px] leading-snug text-ink" aria-live="polite">
        {t('assessing')}
      </p>
      <ol className="mt-6 w-full space-y-1.5">
        {STEPS.map(({ agent, key }, i) => {
          const st = stateOf(agent)
          return (
            <motion.li key={agent} {...rise(0.15 + i * 0.08)} className={`flex min-h-[48px] items-center gap-3 rounded-2xl px-3 ${st === 'running' ? 'bg-card shadow-sm' : ''}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center">
                {st === 'done' ? (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} className="grid h-7 w-7 place-items-center rounded-full bg-leaf text-paper">
                    <Check size={17} strokeWidth={3.2} aria-hidden />
                  </motion.span>
                ) : st === 'running' ? (
                  <Kawung size={26} spin />
                ) : (
                  <span className="h-3 w-3 rounded-full border-2 border-soot/25" />
                )}
              </span>
              <span className={`text-[16.5px] ${st === 'pending' ? 'text-soot-3' : 'font-bold text-soot'}`}>{t(key)}</span>
            </motion.li>
          )
        })}
      </ol>
      <AnimatePresence>
        {stateOf('memo') === 'running' ? (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="font-hand mt-5 max-w-[300px] text-center text-[17px] leading-snug text-ink"
          >
            {t('memoWait')}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function borrowerReasons(app: Application, memo: Memo, t: ReturnType<typeof useBorrower>['t']): string[] {
  // The memo model writes reasons for THIS case in the borrower's language; templates are only a fallback.
  if (memo.borrower_reasons && memo.borrower_reasons.length) return memo.borrower_reasons.slice(0, 3)
  const out: string[] = []
  const recon = app.checks.find((c) => c.id === 'chk_share') ?? app.checks.find((c) => c.agent === 'reconciler' && /vs/i.test(c.name))
  const years = app.facts.find((f) => f.field === 'years_in_business')
  const aff = affordability(app)
  if (memo.decision === 'approve') {
    if (!recon || recon.result === 'pass') out.push(t('r_match'))
    if (app.metrics) out.push(t('r_steady'))
    if (aff.weeklyNet > 0 && aff.share > 0) out.push(t('r_afford', { pct: pct(aff.share) }))
    if (years) out.push(t('r_years', { years: years.value }))
  } else if (memo.decision === 'approve_reduced') {
    out.push(t('r_railBased'), t('r_real'), t('r_small'))
  } else {
    if (app.statement.some((d) => d.total > 0)) out.push(t('r_real'))
    out.push(t('r_notYet'), t('r_small'))
  }
  return out.slice(0, 3)
}

function OfficerCard({ app, effective }: { app: Application; effective: number }) {
  const { t, lang } = useBorrower()
  const d = app.decision
  if (!d)
    return (
      <div className="paper-card flex items-center gap-3 p-4">
        <KawungLoader size={30} />
        <div>
          <p className="text-[16px] font-bold text-soot">{t('officerPending')}</p>
          <p className="text-[14px] text-soot-2">{t('officerPendingSub')}</p>
        </div>
      </div>
    )
  const declined = d.action === 'decline'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`paper-card relative overflow-hidden p-4 ${declined ? 'border-turmeric/60' : 'border-leaf/40'}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16.5px] font-bold leading-snug text-soot">
            {declined ? t('officerDeclined') : d.action === 'adjust' ? t('officerAdjusted', { amount: money(effective, app.market) }) : t('officerApproved')}
          </p>
          <p className="mt-0.5 text-[13.5px] text-soot-2">
            {d.officer} · {fmtDate(d.ts.slice(0, 10), lang, { day: 'numeric', month: 'long' }, app.market)}
          </p>
          {d.note ? (
            <p className="font-hand mt-2 text-[16px] leading-snug text-ink">
              “{d.note}”
            </p>
          ) : null}
        </div>
        {!declined ? (
          <Stamp tone="pass" land rotate={-8} size={14} delay={0.2}>
            {t('stampApproved')}
          </Stamp>
        ) : null}
      </div>
    </motion.div>
  )
}

function PathForward({ starter }: { starter: number | null }) {
  const { t, app } = useBorrower()
  const steps = [t('step1Visit'), t('step2Rail'), starter ? t('step3Start', { amount: money(starter, app.market) }) : t('r_small')]
  return (
    <ol className="relative mt-1 space-y-0">
      <svg className="absolute left-[19px] top-6 h-[calc(100%-48px)] w-3 overflow-visible" preserveAspectRatio="none" viewBox="0 0 10 100" aria-hidden>
        <motion.path d="M5 0 C 9 20, 1 40, 5 60 S 8 90, 5 100" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay: 0.6 }} />
      </svg>
      {steps.map((s, i) => (
        <motion.li key={i} {...rise(0.5 + i * 0.25)} className="relative flex min-h-[64px] items-start gap-3.5 py-2">
          <span className="font-display relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper text-[19px] font-bold text-ink">{i + 1}</span>
          <span className="pt-1.5 text-[17px] font-bold leading-snug text-soot">{s}</span>
        </motion.li>
      ))}
    </ol>
  )
}

function Result({ memo }: { memo: Memo }) {
  const { app, t, lang } = useBorrower()
  const declinedByOfficer = app.decision?.action === 'decline'
  const effective = app.decision && !declinedByOfficer ? app.decision.amount : memo.amount
  const factor = memo.amount ? effective / memo.amount : 1
  const schedule: ScheduleItem[] = useMemo(
    () => memo.schedule.map((s) => ({ ...s, amount: Math.round((s.amount * factor) / (app.market === 'ID' ? 1000 : 10)) * (app.market === 'ID' ? 1000 : 10) })),
    [memo.schedule, factor, app.market],
  )
  const reasons = borrowerReasons(app, memo, t)
  const path = memo.decision === 'refer' || memo.decision === 'decline' || declinedByOfficer
  const amounts = schedule.map((s) => s.amount)
  const total = amounts.reduce((a, b) => a + b, 0)

  return (
    <div className="px-5 pb-8">
      {path ? (
        <>
          <motion.p {...rise(0.05)} className="font-hand mt-1 text-[17px] text-turmeric-deep">
            {t('fromYourProof')} ↘
          </motion.p>
          <motion.h1 {...rise(0.15)} className="font-display mt-1 text-[31px] leading-[1.08] text-ink">
            {t('pathTitle', { name: shortName(app.persona) })}
          </motion.h1>
          {!declinedByOfficer ? (
            <motion.p {...rise(0.3)} className="mt-3 text-[17px] leading-snug text-soot" lang={app.language}>
              {memo.borrower_message}
            </motion.p>
          ) : null}
          <PathForward starter={memo.decision === 'refer' && !declinedByOfficer ? memo.amount : null} />
        </>
      ) : (
        <>
          <motion.p {...rise(0.05)} className="font-hand mt-1 text-[17px] text-turmeric-deep">
            {t('fromYourProof')} ↘
          </motion.p>
          <motion.h1 {...rise(0.15)} className="font-display mt-1 text-[27px] leading-[1.1] text-ink">
            {memo.decision === 'approve' ? t('canBorrow', { name: shortName(app.persona) }) : t('canStart', { name: shortName(app.persona) })}
          </motion.h1>
          <motion.div {...rise(0.3)} className="relative mt-1 inline-block">
            <motion.span
              className="hl absolute -inset-x-2 bottom-[6%] top-[38%]"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.7, ease: [0.3, 0.7, 0.2, 1], delay: 0.75 }}
              aria-hidden
            />
            <span className="font-display-tight tnum relative block font-semibold text-ink" style={{ fontSize: 'min(56px, 13.5cqw)', lineHeight: 1.05 }}>
              {money(effective, app.market)}
            </span>
          </motion.div>
          <motion.p {...rise(0.5)} className="mt-2 text-[16px] font-bold text-soot-2">
            {t('termLine', { weeks: memo.tenor_weeks, range: moneyRange(Math.min(...amounts), Math.max(...amounts), app.market, lang) })}
          </motion.p>
        </>
      )}

      <motion.div {...rise(0.7)} className="mt-5">
        <OfficerCard app={app} effective={effective} />
      </motion.div>

      <motion.section {...rise(0.85)} className="mt-7">
        <h2 className="font-display text-[22px] text-ink">{t('whyTitle')}</h2>
        <ul className="mt-2 space-y-2.5">
          {reasons.map((r, i) => (
            <motion.li key={i} {...rise(0.95 + i * 0.12)} className="flex items-start gap-3 text-[16.5px] leading-snug text-soot">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-leaf text-leaf">
                <Check size={14} strokeWidth={3.4} aria-hidden />
              </span>
              <span>{r}</span>
            </motion.li>
          ))}
        </ul>
      </motion.section>

      {!path ? (
        <motion.section {...rise(1.2)} className="mt-8">
          <div className="flex items-end justify-between gap-2">
            <h2 className="font-display text-[22px] text-ink">{t('scheduleTitle')}</h2>
          </div>
          <p className="mt-0.5 text-[15px] leading-snug text-soot-2">{t('scheduleLead')}</p>
          <div className="paper-card mt-3 px-2 pb-2 pt-1">
            <CoinCalendar
              schedule={schedule}
              market={app.market}
              lang={lang}
              delay={1.35}
              hint={t('coinHint')}
              detailLabel={(s) => t('coinDetail', { n: s.week, date: fmtDate(s.due_date, lang, { day: 'numeric', month: 'short' }, app.market), amount: money(s.amount, app.market) })}
            />
            <p className="mt-1 border-t border-soot/10 px-2 pt-2 text-right text-[13.5px] font-bold text-soot-2">{t('totalRepay', { amount: money(total, app.market) })}</p>
          </div>
        </motion.section>
      ) : null}

      <motion.section {...rise(1.4)} className="mt-8">
        <h2 className="font-display text-[22px] text-ink">{t('coachingTitle')}</h2>
        <ul className="mt-2.5 space-y-2.5">
          {memo.coaching.map((c, i) => (
            <li key={i} className="flex items-start gap-3 rounded-2xl bg-card/70 p-3 text-[16px] leading-snug text-soot" lang={app.language}>
              <Lightbulb size={20} className="mt-0.5 shrink-0 text-turmeric-deep" aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </motion.section>
    </div>
  )
}

export function HasilStep() {
  const { app, t, refresh } = useBorrower()
  const { active, toggle } = useSpeech()
  const memo = app.memo
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (memo) return
    if (['draft', 'extracting'].includes(app.status)) return
    if (app.status === 'assessing' && !getStream('assess', app.id)) return // started elsewhere — polling will pick it up
    if (!isStreaming('assess', app.id)) startStream('assess', app.id, { force: !!getStream('assess', app.id)?.failed })
    return subscribeStream('assess', app.id, (e) => {
      if (e.type === 'done') void refresh()
      if (e.type === 'error') setError(e.message)
      if (e.type === 'memo') void refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, !!memo])

  const listening = active === 'explain'
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {memo ? (
            <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
              <div className="pt-4" />
              <Result memo={memo} />
            </motion.div>
          ) : error ? (
            <motion.div key="err" className="p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-[17px] font-bold text-chili-ink" role="alert">
                {t('errorGeneric')}
              </p>
              <button
                type="button"
                className="btn-ink mt-4 w-full"
                onClick={() => {
                  setError(null)
                  startStream('assess', app.id, { force: true })
                }}
              >
                {t('retry')}
              </button>
            </motion.div>
          ) : (
            <motion.div key="progress" exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>
              <Progress />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {memo ? (
        <div className="shrink-0 border-t border-soot/10 bg-paper/95 px-4 pb-4 pt-3 backdrop-blur">
          <button
            type="button"
            className="btn-ink w-full"
            aria-pressed={listening}
            onClick={() => toggle('explain', { kind: 'explain', appId: app.id, fallbackText: memo.borrower_message, lang: app.language })}
          >
            {listening ? <Square size={20} fill="currentColor" aria-hidden /> : <Headphones size={23} aria-hidden />}
            {listening ? t('stop') : t('listenResult')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
