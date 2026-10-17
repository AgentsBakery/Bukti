import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { Application, Lang } from '../api/types'
import { Kawung, KawungLoader } from '../components/Kawung'
import { translate } from '../i18n/strings'
import { stopSpeech } from '../lib/speech'
import { useTitle } from '../lib/hooks'
import { useApplication } from '../lib/useApplication'
import { LanguagePicker, SettingsMenu, Stepper } from './Chrome'
import { CeritaStep } from './CeritaStep'
import { Ctx, makeT, type BorrowerCtx, type Step } from './context'
import { FotoStep } from './FotoStep'
import { HasilStep } from './HasilStep'

const AFTER: Record<Step, Application['status'][]> = {
  foto: [],
  cerita: ['extracted', 'interviewed', 'assessing', 'ready', 'decided'],
  hasil: ['interviewed', 'assessing', 'ready', 'decided'],
}

function initialStep(app: Application): Step {
  if (['interviewed', 'assessing', 'ready', 'decided'].includes(app.status)) return 'hasil'
  if (app.status === 'extracted') return 'cerita'
  return 'foto'
}

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode */
    }
  },
}

/**
 * The borrower's phone app. Fills its container (so it works full-screen on a phone and
 * inside the demo-mode device frame). Dialogs portal into the app root, never the page.
 */
export default function BorrowerApp({ appId, embedded = false }: { appId: string; embedded?: boolean }) {
  const { app, error, refresh, replace } = useApplication(appId, 2500)
  const [portal, setPortal] = useState<HTMLDivElement | null>(null)
  const [lang, setLangState] = useState<Lang | null>(() => store.get(`bukti.lang.${appId}`) as Lang | null)
  const [hc, setHcState] = useState(() => store.get('bukti.hc') === '1')
  const [step, setStep] = useState<Step | null>(null)
  const [pickerOpen, setPickerOpen] = useState(() => !store.get(`bukti.lang.${appId}`))
  useTitle(embedded ? document.title : 'Bukti')

  useEffect(() => {
    if (app && !step) setStep(initialStep(app))
  }, [app, step])

  const setLang = useCallback(
    (l: Lang) => {
      stopSpeech()
      setLangState(l)
      store.set(`bukti.lang.${appId}`, l)
    },
    [appId],
  )
  const setHc = (v: boolean) => {
    setHcState(v)
    store.set('bukti.hc', v ? '1' : '0')
  }
  const goto = useCallback((s: Step) => {
    stopSpeech()
    setStep(s)
  }, [])

  useEffect(() => () => stopSpeech(), [])

  const effLang: Lang = lang ?? app?.language ?? 'en'
  const ctx = useMemo<BorrowerCtx | null>(() => {
    if (!app) return null
    return {
      app,
      lang: effLang,
      setLang,
      t: makeT(app, effLang),
      rail: app.market === 'ID' ? 'QRIS' : 'UPI',
      refresh,
      replace,
      goto,
      portal,
      embedded,
    }
  }, [app, effLang, setLang, refresh, replace, goto, portal, embedded])

  const reachable: Record<Step, boolean> = {
    foto: true,
    cerita: !!app && app.entries.length > 0 && AFTER.cerita.includes(app.status),
    hasil: !!app && (AFTER.hasil.includes(app.status) || !!app.memo),
  }

  return (
    <div
      ref={setPortal}
      className="grain relative flex h-full w-full flex-col overflow-hidden bg-paper text-soot"
      style={{ containerType: 'size' }}
      data-contrast={hc ? 'high' : undefined}
      lang={effLang}
    >
      {embedded ? <div className="h-[50px] shrink-0" aria-hidden /> : null}
      {!ctx ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          {error ? (
            <div>
              <Kawung size={44} className="mx-auto mb-4" />
              <p className="font-display text-[22px] text-ink">{translate(effLang, 'notFound')}</p>
              <Link to="/" className="link-ink mt-4 inline-block text-[16px]">
                {translate(effLang, 'backHome')}
              </Link>
            </div>
          ) : (
            <KawungLoader size={46} label={translate(effLang, 'loadingApp')} />
          )}
        </div>
      ) : (
        <Ctx.Provider value={ctx}>
          {pickerOpen ? (
            <LanguagePicker
              initial={effLang}
              onPick={(l) => {
                setLang(l)
                setPickerOpen(false)
              }}
            />
          ) : (
            <>
              <div className="relative z-20 flex shrink-0 items-center gap-1 border-b border-soot/10 px-2.5 pb-1.5 pt-2.5">
                <div className="grid h-12 w-10 place-items-center" aria-hidden>
                  <Kawung size={26} />
                </div>
                <Stepper step={step ?? 'foto'} reachable={reachable} />
                <SettingsMenu hc={hc} setHc={setHc} />
              </div>
              <main className="relative min-h-0 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step ?? 'foto'}
                    className="absolute inset-0"
                    initial={{ opacity: 0, x: 28 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -28 }}
                    transition={{ duration: 0.32, ease: [0.22, 0.8, 0.24, 1] }}
                  >
                    {step === 'cerita' ? <CeritaStep /> : step === 'hasil' ? <HasilStep /> : <FotoStep />}
                  </motion.div>
                </AnimatePresence>
              </main>
            </>
          )}
        </Ctx.Provider>
      )}
      {embedded ? <div className="h-[12px] shrink-0 bg-paper" aria-hidden /> : null}
    </div>
  )
}
