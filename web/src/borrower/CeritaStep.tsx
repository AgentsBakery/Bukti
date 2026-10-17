import { ArrowRight, Mic, MicOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { MicUnavailableError, type InterviewConnection } from '../api/client'
import type { Fact } from '../api/types'
import { hasKey } from '../i18n/strings'
import { stopSpeech } from '../lib/speech'
import { useBorrower } from './context'
import { InkOrb } from './InkOrb'
import { SpeakerButton } from './Scaffold'

type Phase = 'intro' | 'connecting' | 'live' | 'done' | 'denied' | 'error'
interface Turn {
  role: 'agent' | 'user'
  text: string
  final: boolean
  en?: string
}

const TILTS = [-2.5, 1.8, -1.2, 2.6, -1.8, 1.1]

export function FactChip({ fact, index, lang, label }: { fact: Fact; index: number; lang: string; label: string }) {
  return (
    <motion.li
      initial={{ scale: 1.7, opacity: 0, rotate: TILTS[index % TILTS.length] - 10 }}
      animate={{ scale: 1, opacity: 1, rotate: TILTS[index % TILTS.length] }}
      transition={{ type: 'spring', stiffness: 480, damping: 20, mass: 0.7 }}
      className="relative"
      lang={lang}
    >
      <div className="relative px-3 py-1.5 text-ink">
        <span
          className="absolute inset-0 rounded-[10px] border-[2.25px] border-ink"
          style={{ boxShadow: '0 0 0 1.5px var(--color-paper) inset, 0 0 0 2.75px var(--color-ink) inset', filter: 'url(#ink-rough)', mixBlendMode: 'multiply' }}
          aria-hidden
        />
        <div className="relative text-[10.5px] font-extrabold uppercase tracking-[0.13em] opacity-75">{label}</div>
        <div className="relative text-[16px] font-bold leading-tight">{fact.value}</div>
      </div>
    </motion.li>
  )
}

export function CeritaStep() {
  const { app, t, lang, goto, refresh } = useBorrower()
  const already = app.facts.length > 0 && ['interviewed', 'assessing', 'ready', 'decided'].includes(app.status)
  const [phase, setPhase] = useState<Phase>(already ? 'done' : 'intro')
  const [turns, setTurns] = useState<Turn[]>([])
  const [facts, setFacts] = useState<Fact[]>(already ? app.facts : [])
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [finals, setFinals] = useState<string[]>([])
  const conn = useRef<InterviewConnection | null>(null)
  const [userTalking, setUserTalking] = useState(false)
  const [askingMic, setAskingMic] = useState(false)

  useEffect(() => () => conn.current?.close(), [])
  // A finished live interview moves straight on to the result, so the assessment always runs.
  const justFinished = useRef(false)
  useEffect(() => {
    if (phase !== 'done' || already || justFinished.current) return
    justFinished.current = true
    const timer = window.setTimeout(() => goto('hasil'), 2600)
    return () => window.clearTimeout(timer)
  }, [phase, already, goto])

  // derive "you're speaking" from live levels (cheap 5 Hz poll)
  useEffect(() => {
    if (phase !== 'live') return
    const iv = window.setInterval(() => {
      const l = conn.current?.levels()
      setUserTalking(!!l && l.user > 0.18)
    }, 200)
    return () => window.clearInterval(iv)
  }, [phase])

  const factLabel = (f: Fact) => {
    const k = `f_${f.field}`
    return hasKey(k) ? t(k) : f.label
  }

  const begin = async () => {
    stopSpeech()
    setPhase('connecting')
    setTurns([])
    setFacts([])
    try {
      const c = await api.openInterview(
        app.id,
        lang,
        {
          onTranscript: (tr) => {
            // Contract: final:false = fragment to append; final:true = the complete utterance.
            setTurns((prev) => {
              const last = prev[prev.length - 1]
              const open = last && last.role === tr.role && !last.final
              if (!tr.final) {
                if (open) return [...prev.slice(0, -1), { ...last, text: last.text + tr.text, en: tr.en ?? last.en }]
                return [...prev, { role: tr.role, text: tr.text.trimStart(), final: false, en: tr.en }].slice(-8)
              }
              const done = { role: tr.role, text: tr.text.trim(), final: true, en: tr.en ?? (open ? last.en : undefined) }
              return open ? [...prev.slice(0, -1), done] : [...prev, done].slice(-8)
            })
            if (tr.final) setFinals((f) => [...f.slice(-4), tr.text])
          },
          // A re-asked question re-records its field: replace that chip rather than adding a second one.
          onFact: (f) => setFacts((prev) => [...prev.filter((x) => x.id !== f.id && (f.field === 'other' || x.field !== f.field)), f]),
          onSpeaking: setAgentSpeaking,
          onInterrupted: () => setAgentSpeaking(false),
          onDone: (fs) => {
            if (fs.length) setFacts(fs)
            setPhase('done')
            conn.current?.close()
            conn.current = null
            void refresh()
          },
          onError: () => setPhase((p) => (p === 'done' ? p : 'error')),
        },
        { onAskingMic: () => setAskingMic(true) },
      )
      setAskingMic(false)
      conn.current = c
      setPhase('live')
    } catch (err) {
      setAskingMic(false)
      setPhase(err instanceof MicUnavailableError ? 'denied' : 'error')
    }
  }

  const finish = () => conn.current?.end()
  const skip = () => {
    conn.current?.close()
    conn.current = null
    goto('hasil')
  }
  const toggleMute = () => {
    const m = !muted
    setMuted(m)
    conn.current?.setMuted(m)
  }
  const levels = useCallback(() => conn.current?.levels() ?? { agent: 0, user: 0 }, [])

  const visible = turns.slice(-2)
  const status =
    phase === 'connecting'
      ? askingMic
        ? t('allowMic')
        : t('connecting')
      : phase === 'live'
        ? agentSpeaking
          ? t('agentSpeaking')
          : muted
            ? t('micOff')
            : userTalking
              ? t('youSpeaking')
              : t('listening')
        : phase === 'done'
          ? t('interviewDone')
          : t('idleHint')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        <header className="flex items-start gap-3 px-5 pt-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[29px] leading-[1.08] text-ink">{t('ceritaTitle')}</h1>
            <AnimatePresence initial={false}>
              {phase === 'intro' || phase === 'denied' || phase === 'error' ? (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 text-[16.5px] leading-snug text-soot-2">
                  {t('ceritaLead')}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
          <SpeakerButton id="cerita" text={t('ceritaSpeak')} />
        </header>

        {/* the orb */}
        <div className="relative mt-1 flex flex-col items-center">
          <motion.button
            type="button"
            onClick={phase === 'intro' || phase === 'error' ? begin : undefined}
            className="relative grid place-items-center rounded-full"
            aria-label={phase === 'intro' ? t('startTalking') : status}
            tabIndex={phase === 'intro' || phase === 'error' ? 0 : -1}
            whileTap={phase === 'intro' ? { scale: 0.96 } : undefined}
            style={{ cursor: phase === 'intro' ? 'pointer' : 'default' }}
          >
            <InkOrb levels={levels} state={phase === 'live' ? 'live' : phase === 'connecting' ? 'connecting' : phase === 'done' ? 'done' : 'idle'} size={phase === 'intro' || phase === 'denied' || phase === 'error' ? 250 : phase === 'done' ? 150 : 196} />
            {phase === 'intro' ? <Mic className="pointer-events-none absolute text-paper" size={44} strokeWidth={1.8} aria-hidden /> : null}
          </motion.button>
          <p className="font-hand -mt-2 text-[18px] text-ink" aria-live="polite">
            {status}
          </p>
        </div>

        {phase === 'intro' ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="px-5 pt-5 text-center">
            <p className="text-[14.5px] font-bold text-soot-2">{t('topicsLead')}</p>
            <ul className="mt-2.5 flex flex-wrap justify-center gap-2">
              {(['topicSales', 'topicDays', 'topicPlan'] as const).map((k, i) => (
                <li key={k} className="rounded-[10px] border-2 border-dashed border-ink/35 px-3 py-1.5 text-[15px] font-bold text-ink/80" style={{ rotate: `${[-2, 1.5, -1][i]}deg` }}>
                  {t(k)}
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}

        {/* stamped facts */}
        {facts.length ? (
          <section className="px-5 pt-3" aria-label={t('factsHeading')}>
            <h2 className="eyebrow mb-2">{t('factsHeading')}</h2>
            <ul className="flex flex-wrap gap-2.5">
              {facts.map((f, i) => (
                <FactChip key={f.id} fact={f} index={i} lang={lang} label={factLabel(f)} />
              ))}
            </ul>
          </section>
        ) : null}
        {/* captions */}
        <div className="mt-4 min-h-[118px] px-5 pb-5">
          <ul className="space-y-2.5" aria-hidden>
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((tr, i) => {
                const old = i < visible.length - 1
                return (
                  <motion.li
                    key={`${turns.length - visible.length + i}-${tr.role}`}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: old ? 0.5 : 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.35 }}
                    lang={lang}
                  >
                    {tr.role === 'agent' ? (
                      <p className="font-display text-[20px] leading-snug text-ink">{tr.text}</p>
                    ) : (
                      <p className="text-[17.5px] leading-snug text-soot">
                        <span className="mr-1.5 rounded-md bg-turmeric/30 px-1.5 py-0.5 text-[12px] font-extrabold uppercase tracking-wider text-soot">{t('youLabel')}</span>
                        {tr.text}
                      </p>
                    )}
                    {tr.en && lang !== 'en' && (tr.final || !old) ? (
                      <p className="mt-0.5 text-[13.5px] italic leading-snug text-soot-3" lang="en">
                        {tr.en}
                      </p>
                    ) : null}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
          <div className="sr-only" aria-live="polite" lang={lang}>
            {finals[finals.length - 1]}
          </div>
          {phase === 'denied' || phase === 'error' ? (
            <div className="paper-card mt-2 flex gap-3 p-4 text-[16px] leading-snug" role="alert">
              <MicOff size={24} className="mt-0.5 shrink-0 text-turmeric-deep" aria-hidden />
              <span>{phase === 'denied' ? t('micDenied') : t('connectionLost')}</span>
            </div>
          ) : null}
        </div>

      </div>

      <div className="shrink-0 border-t border-soot/10 bg-paper/95 px-4 pb-3 pt-3 backdrop-blur">
        {phase === 'live' || phase === 'connecting' ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleMute}
              disabled={phase !== 'live'}
              aria-pressed={muted}
              aria-label={muted ? t('unmute') : t('mute')}
              className={`grid h-[64px] w-[64px] shrink-0 place-items-center rounded-full border-2 transition-colors ${
                muted ? 'border-chili bg-chili/10 text-chili-ink' : 'border-ink bg-card text-ink'
              }`}
            >
              {muted ? <MicOff size={26} aria-hidden /> : <Mic size={26} aria-hidden />}
            </button>
            <button type="button" className="btn-ink flex-1" onClick={finish} disabled={phase !== 'live'}>
              {t('finish')}
            </button>
          </div>
        ) : phase === 'done' ? (
          <button type="button" className="btn-ink w-full" onClick={() => goto('hasil')}>
            {t('seeResult')} <ArrowRight size={22} aria-hidden />
          </button>
        ) : (
          <button type="button" className="btn-ink w-full" onClick={begin}>
            <Mic size={22} aria-hidden /> {phase === 'intro' ? t('startTalking') : t('retry')}
          </button>
        )}
        {phase !== 'done' ? (
          <div className="mt-1.5 text-center">
            <button type="button" onClick={skip} className="link-ink min-h-[44px] px-3 text-[15px]">
              {t('skipInterview')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
