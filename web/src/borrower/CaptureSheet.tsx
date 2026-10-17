import { Camera, Check, ImageUp, NotebookPen, QrCode, Receipt, Store, TriangleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Evidence, EvidenceType } from '../api/types'
import { KawungLoader } from '../components/Kawung'
import { checkPhoto, type PhotoQuality } from '../lib/imageQuality'
import { useBorrower } from './context'

const TYPES: { type: EvidenceType; icon: typeof Camera }[] = [
  { type: 'ledger', icon: NotebookPen },
  { type: 'statement', icon: QrCode },
  { type: 'receipt', icon: Receipt },
  { type: 'shop', icon: Store },
]

function Corners({ className = '' }: { className?: string }) {
  const c = 'absolute h-7 w-7 border-turmeric'
  return (
    <div className={`pointer-events-none absolute inset-3 ${className}`} aria-hidden>
      <span className={`${c} left-0 top-0 rounded-tl-xl border-l-[3.5px] border-t-[3.5px]`} />
      <span className={`${c} right-0 top-0 rounded-tr-xl border-r-[3.5px] border-t-[3.5px]`} />
      <span className={`${c} bottom-0 left-0 rounded-bl-xl border-b-[3.5px] border-l-[3.5px]`} />
      <span className={`${c} bottom-0 right-0 rounded-br-xl border-b-[3.5px] border-r-[3.5px]`} />
    </div>
  )
}

export function CaptureSheet({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: (e: Evidence) => void }) {
  const { t, rail, app, portal } = useBorrower()
  const [type, setType] = useState<EvidenceType>('ledger')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [quality, setQuality] = useState<PhotoQuality | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setQuality(null)
      setErr(null)
      setBusy(false)
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p)
        return null
      })
    }
  }, [open])

  const pick = async (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p)
      return URL.createObjectURL(f)
    })
    setQuality(null)
    try {
      setQuality(await checkPhoto(f))
    } catch {
      setQuality({ verdict: 'ok', brightness: 0, glare: 0, sharpness: 0 })
    }
  }

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      const added = await api.uploadEvidence(app.id, file, type, file.name)
      added.forEach(onAdded)
      onOpenChange(false)
    } catch {
      setErr(t('errorGeneric'))
      setBusy(false)
    }
  }

  const retake = () => {
    setFile(null)
    setQuality(null)
    camRef.current?.click()
  }

  const typeLabel = (x: EvidenceType) =>
    x === 'ledger' ? t('evLedger') : x === 'statement' ? t('evStatement', { rail }) : x === 'receipt' ? t('evReceipt') : t('evShop')
  const warn = quality && quality.verdict !== 'ok'
  const warnText = quality?.verdict === 'dark' ? t('tooDark') : quality?.verdict === 'bright' ? t('tooBright') : t('tooBlurry')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portal ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-40 bg-soot/45 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_.2s_ease]" />
        <Dialog.Content
          className="grain absolute inset-x-0 bottom-0 z-50 max-h-[92%] overflow-y-auto rounded-t-[28px] bg-paper px-5 pb-6 pt-3 shadow-[0_-20px_50px_-20px_rgb(0_0_0/0.5)] data-[state=open]:animate-[fade-up_.28s_var(--ease-ink)]"
          aria-describedby={undefined}
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-soot/20" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-display text-[26px] leading-tight text-ink">{t('captureTitle')}</Dialog.Title>
            <Dialog.Close className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-paper-2 text-ink" aria-label={t('close')}>
              <X size={22} />
            </Dialog.Close>
          </div>

          {/* Guide frame / preview */}
          <div className="relative mx-auto mt-4 aspect-[3/4] w-[min(100%,214px)] overflow-hidden rounded-[18px] bg-[#3b342c] shadow-inner">
            {preview ? (
              <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-6 rotate-[-2deg] rounded-[3px] bg-paper/95 shadow-xl">
                <div className="ruled absolute inset-0 rounded-[3px]" style={{ ['--rule' as string]: '16px', ['--rule-offset' as string]: '8px' }} />
                <div className="absolute bottom-2 left-6 top-2 w-px bg-margin/70" />
              </div>
            )}
            <Corners />
            {!preview ? (
              <div className="font-hand absolute inset-x-8 top-1/2 -translate-y-1/2 -rotate-2 text-center text-[18px] leading-tight text-ink/70">{t('fitPage')}</div>
            ) : null}
          </div>

          <AnimatePresence mode="wait">
            {!file ? (
              <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="mt-4 text-[16px] leading-snug text-soot-2">{t('captureHint')}</p>
                <fieldset className="mt-4">
                  <legend className="mb-2 text-[15px] font-bold text-soot">{t('whatIsIt')}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {TYPES.map(({ type: x, icon: Icon }) => (
                      <label
                        key={x}
                        className={`flex min-h-[56px] cursor-pointer items-center gap-2.5 rounded-2xl border-2 px-3 text-[15px] font-bold transition-colors ${
                          type === x ? 'border-ink bg-ink text-paper' : 'border-soot/15 bg-card text-ink'
                        }`}
                      >
                        <input type="radio" name="ev-type" value={x} checked={type === x} onChange={() => setType(x)} className="sr-only" />
                        <Icon size={20} aria-hidden />
                        <span className="leading-tight">{typeLabel(x)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-5 grid gap-2.5">
                  <button type="button" className="btn-ink w-full" onClick={() => camRef.current?.click()}>
                    <Camera size={22} aria-hidden /> {t('openCamera')}
                  </button>
                  <button type="button" className="btn-paper w-full" onClick={() => galRef.current?.click()}>
                    <ImageUp size={20} aria-hidden /> {t('fromGallery')}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="check" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
                <div aria-live="polite">
                  {!quality ? (
                    <KawungLoader size={30} label={t('checking')} />
                  ) : warn ? (
                    <div className="flex gap-3 rounded-2xl border-2 border-turmeric bg-turmeric-soft/60 p-3.5 text-[16px] leading-snug text-soot">
                      <TriangleAlert className="mt-0.5 shrink-0 text-turmeric-deep" size={22} aria-hidden />
                      <span>{warnText}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-leaf/40 bg-leaf/10 p-3.5 text-[16px] font-bold text-leaf-ink">
                      <Check size={22} strokeWidth={3} aria-hidden /> {t('looksGood')}
                    </div>
                  )}
                </div>
                {err ? <p className="mt-3 text-[15px] font-bold text-chili-ink">{err}</p> : null}
                <div className="mt-4 grid gap-2.5">
                  {warn ? (
                    <>
                      <button type="button" className="btn-ink w-full" onClick={retake} disabled={busy}>
                        <Camera size={22} aria-hidden /> {t('retake')}
                      </button>
                      <button type="button" className="btn-paper w-full" onClick={upload} disabled={busy}>
                        {busy ? t('saving') : t('useAnyway')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-ink w-full" onClick={upload} disabled={busy || !quality}>
                        {busy ? t('saving') : t('usePhoto')}
                      </button>
                      <button type="button" className="btn-paper w-full" onClick={retake} disabled={busy}>
                        <Camera size={20} aria-hidden /> {t('retake')}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }} />
          <input ref={galRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
