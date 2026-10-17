import { ArrowRight, BookOpenText, Camera, CircleCheck, ShieldCheck, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useCallback, useState } from 'react'
import type { Evidence } from '../api/types'
import { KawungLoader } from '../components/Kawung'
import { isStreaming, startStream } from '../lib/streams'
import { CaptureSheet } from './CaptureSheet'
import { useBorrower } from './context'
import { EvidenceTray } from './EvidenceTray'
import { ProofLift, summarise, type LiftSummary } from './ProofLift'
import { StepScaffold } from './Scaffold'

const AFTER_EXTRACT = ['extracted', 'interviewed', 'assessing', 'ready', 'decided']

export function FotoStep() {
  const { app, t, refresh, goto, portal } = useBorrower()
  const extracted = app.entries.length > 0 && AFTER_EXTRACT.includes(app.status)
  const [mode, setMode] = useState<'tray' | 'live' | 'static'>(() =>
    isStreaming('extract', app.id) ? 'live' : extracted || app.status === 'extracting' ? 'static' : 'tray',
  )
  const [summary, setSummary] = useState<LiftSummary | null>(() =>
    extracted ? summarise(app.entries, new Map(app.statement.map((d) => [d.date, d]))) : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [preview, setPreview] = useState<Evidence | null>(null)

  const start = () => {
    setError(null)
    setSummary(null)
    startStream('extract', app.id, { force: true })
    setMode('live')
  }
  const onFinished = useCallback(
    (s: LiftSummary) => {
      setSummary(s)
      void refresh()
    },
    [refresh],
  )
  const onError = useCallback((m: string) => setError(m), [])

  const hasLedger = app.evidence.some((e) => e.type === 'ledger')
  const reading = mode === 'live' && !summary && !error

  if (mode === 'tray') {
    return (
      <StepScaffold
        title={t('fotoTitle')}
        lead={t('fotoLead')}
        speak={t('fotoSpeak')}
        speakId="foto"
        bottom={
          <button type="button" className="btn-ink w-full" onClick={start} disabled={!hasLedger}>
            <BookOpenText size={23} aria-hidden /> {t('readMyBook')}
          </button>
        }
      >
        <div className="px-4 pb-6 pt-5">
          <EvidenceTray evidence={app.evidence} onOpen={setPreview} />
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + app.evidence.length * 0.22 + 0.2 }}
            onClick={() => setSheet(true)}
            className="mt-4 flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-ink/35 bg-card/60 text-[17px] font-bold text-ink transition-colors hover:border-ink/70 hover:bg-card"
          >
            <Camera size={22} aria-hidden /> {t('addPhoto')}
          </motion.button>
          <p className="mt-5 flex items-center justify-center gap-2 text-center text-[14px] text-soot-2">
            <ShieldCheck size={17} className="shrink-0 text-leaf" aria-hidden /> {t('privacy')}
          </p>
        </div>
        <CaptureSheet open={sheet} onOpenChange={setSheet} onAdded={() => void refresh()} />
        <Dialog.Root open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
          <Dialog.Portal container={portal ?? undefined}>
            <Dialog.Overlay className="absolute inset-0 z-40 bg-soot/70" />
            <Dialog.Content className="absolute inset-3 z-50 flex flex-col items-center justify-center" aria-describedby={undefined}>
              <Dialog.Title className="sr-only">{preview?.label}</Dialog.Title>
              {preview ? <img src={preview.url} alt={preview.label} className="max-h-[88%] max-w-full rounded-md shadow-2xl" /> : null}
              <Dialog.Close className="btn-paper mt-4 min-h-[52px]" aria-label={t('close')}>
                <X size={20} aria-hidden /> {t('close')}
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </StepScaffold>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ProofLift key={mode === 'static' ? `s-${app.entries.length}` : 'live'} app={app} live={mode === 'live'} onFinished={onFinished} onError={onError} />
      </div>
      <div className="relative shrink-0 border-t border-soot/10 bg-paper/95 px-4 pb-4 pt-3 backdrop-blur">
        <AnimatePresence mode="wait" initial={false}>
          {error ? (
            <motion.div key="err" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="mb-3 text-[16px] font-bold text-chili-ink" role="alert">
                {t('errorGeneric')}
              </p>
              <button type="button" className="btn-ink w-full" onClick={start}>
                {t('retry')}
              </button>
            </motion.div>
          ) : reading || (mode === 'static' && app.status === 'extracting') ? (
            <motion.div key="reading" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <div className="flex min-h-[60px] items-center justify-center gap-3 rounded-2xl bg-paper-2 text-[17px] font-bold text-ink" aria-live="polite">
                <KawungLoader size={26} />
                <span>{t('readingBook')}</span>
              </div>
            </motion.div>
          ) : (
            <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 0.8, 0.24, 1] }}>
              {summary ? (
                <div className="mb-3 flex items-start gap-3 px-1" aria-live="polite">
                  <CircleCheck size={26} className="mt-0.5 shrink-0 text-leaf" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-display text-[21px] leading-tight text-ink">{t('readDone', { lines: summary.lines, pages: summary.pages })}</p>
                    {summary.days ? (
                      <p className="mt-0.5 text-[14.5px] leading-snug text-soot-2">
                        {summary.matched >= summary.days * 0.6 ? t('matchedSummary', { n: summary.matched, d: summary.days }) : t('mismatchSummary')}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <button type="button" className="btn-ink w-full" onClick={() => goto('cerita')}>
                {t('continue')} <ArrowRight size={22} aria-hidden />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
