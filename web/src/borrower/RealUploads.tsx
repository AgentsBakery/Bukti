import { Camera, Check, FileText, ImageUp, LoaderCircle, RotateCcw, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Evidence, EvidenceType } from '../api/types'
import { checkPhoto } from '../lib/imageQuality'
import { useBorrower } from './context'

const PARALLEL = 3
const MAX_ITEMS = 20
const TYPES: EvidenceType[] = ['ledger', 'statement', 'receipt', 'shop', 'other']

interface Pending {
  key: string
  file: File
  state: 'waiting' | 'uploading' | 'error'
  error?: string
}

function useTypeLabel() {
  const { t, rail } = useBorrower()
  return (x: EvidenceType) =>
    x === 'ledger' ? t('evLedger') : x === 'statement' ? t('evStatement', { rail }) : x === 'receipt' ? t('evReceipt') : x === 'shop' ? t('evShop') : t('evOther')
}

/**
 * Real applications: many photos or PDFs at once. Each file uploads as soon as it is picked (three at a time),
 * lands in Cloud Storage, and comes back labelled by Gemini. The borrower can confirm, change or remove any label.
 */
export function RealUploads({ onPreview, onBusy }: { onPreview: (e: Evidence) => void; onBusy: (busy: boolean) => void }) {
  const { app, t, refresh } = useBorrower()
  const typeLabel = useTypeLabel()
  const [pending, setPending] = useState<Pending[]>([])
  // The queue lives in a ref so uploads can be started from event handlers; state mirrors it for rendering.
  const queue = useRef<Pending[]>([])
  const sync = () => setPending([...queue.current])
  const [blurry, setBlurry] = useState<Record<string, boolean>>({})
  const [working, setWorking] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  const docs = app.evidence.filter((e) => e.label_source !== 'pack')
  const room = MAX_ITEMS - app.evidence.length - pending.length

  useEffect(() => onBusy(pending.some((p) => p.state !== 'error')), [pending, onBusy])

  const upload = async (item: Pending) => {
    const isImage = item.file.type.startsWith('image/')
    const quality = isImage ? checkPhoto(item.file).catch(() => null) : Promise.resolve(null)
    try {
      const added = await api.uploadEvidence(app.id, item.file, undefined, item.file.name)
      const q = await quality
      if (q && q.verdict !== 'ok') setBlurry((b) => ({ ...b, ...Object.fromEntries(added.map((e) => [e.id, true])) }))
      queue.current = queue.current.filter((p) => p.key !== item.key)
      void refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : t('errorGeneric')
      queue.current = queue.current.map((p) => (p.key === item.key ? { ...p, state: 'error', error: message } : p))
    }
    pump()
  }

  // Keep up to PARALLEL uploads running.
  function pump() {
    let running = queue.current.filter((p) => p.state === 'uploading').length
    for (const p of queue.current) {
      if (running >= PARALLEL) break
      if (p.state !== 'waiting') continue
      p.state = 'uploading'
      running++
      void upload(p)
    }
    sync()
  }

  const add = (files: FileList | null) => {
    if (!files?.length) return
    setNotice(null)
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    if (picked.length > room) setNotice(t('limitReached'))
    const items = picked.slice(0, Math.max(0, room)).map((file) => ({ key: `p${++seq.current}`, file, state: 'waiting' as const }))
    queue.current = [...queue.current, ...items]
    pump()
  }

  const retry = (key: string) => {
    queue.current = queue.current.map((p) => (p.key === key ? { ...p, state: 'waiting', error: undefined } : p))
    pump()
  }
  const dismiss = (key: string) => {
    queue.current = queue.current.filter((p) => p.key !== key)
    sync()
  }

  const setType = async (ev: Evidence, type: EvidenceType) => {
    setWorking(ev.id)
    try {
      await api.updateEvidence(app.id, ev.id, type)
      await refresh()
    } catch {
      setNotice(t('errorGeneric'))
    } finally {
      setWorking(null)
    }
  }
  const remove = async (ev: Evidence) => {
    setWorking(ev.id)
    try {
      await api.deleteEvidence(app.id, ev.id)
      await refresh()
    } catch {
      setNotice(t('errorGeneric'))
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="mt-5">
      <p className="text-[15.5px] leading-snug text-soot-2">{t('uploadHint')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" className="btn-ink min-h-[60px] w-full !px-3 text-[16px]" onClick={() => camRef.current?.click()} disabled={room <= 0}>
          <Camera size={21} aria-hidden /> {t('takePhoto')}
        </button>
        <button type="button" className="btn-paper min-h-[60px] w-full !px-3 text-[16px]" onClick={() => galRef.current?.click()} disabled={room <= 0}>
          <ImageUp size={20} aria-hidden /> {t('choosePhotos')}
        </button>
      </div>
      {notice ? (
        <p className="mt-2 text-[14.5px] font-bold text-chili-ink" role="alert">
          {notice}
        </p>
      ) : null}

      {docs.length || pending.length ? (
        <section className="mt-5" aria-label={t('docsTitle')}>
          <h3 className="eyebrow mb-2 !text-[11px]">{t('docsTitle')}</h3>
          <ul className="grid gap-2" aria-live="polite">
            <AnimatePresence initial={false}>
              {docs.map((ev) => (
                <DocRow
                  key={ev.id}
                  ev={ev}
                  blurry={!!blurry[ev.id]}
                  busy={working === ev.id}
                  typeLabel={typeLabel}
                  onPreview={() => onPreview(ev)}
                  onType={(x) => void setType(ev, x)}
                  onRemove={() => void remove(ev)}
                />
              ))}
              {pending.map((p) => (
                <motion.li
                  key={p.key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-2.5 ${p.state === 'error' ? 'border-chili/40 bg-chili/5' : 'border-dashed border-ink/20 bg-card/70'}`}
                >
                  <span className="grid h-14 w-11 shrink-0 place-items-center rounded-md bg-paper-3 text-ink/60">
                    {p.state === 'error' ? <TriangleAlert size={20} className="text-chili" aria-hidden /> : <LoaderCircle size={20} className="animate-spin" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-ink">{p.file.name}</span>
                    <span className={`block text-[13px] ${p.state === 'error' ? 'font-bold text-chili-ink' : 'text-soot-2'}`}>
                      {p.state === 'error' ? `${t('uploadFailed')}: ${p.error}` : p.state === 'waiting' ? t('uploading') : t('sorting')}
                    </span>
                  </span>
                  {p.state === 'error' ? (
                    <span className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => retry(p.key)} className="grid h-11 w-11 place-items-center rounded-xl bg-paper-2 text-ink" aria-label={t('retry')}>
                        <RotateCcw size={18} aria-hidden />
                      </button>
                      <button type="button" onClick={() => dismiss(p.key)} className="grid h-11 w-11 place-items-center rounded-xl bg-paper-2 text-chili-ink" aria-label={t('removeDoc')}>
                        <Trash2 size={18} aria-hidden />
                      </button>
                    </span>
                  ) : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ) : null}

      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }} />
      <input ref={galRef} type="file" accept="image/*,application/pdf" multiple className="sr-only" tabIndex={-1} onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }} />
    </div>
  )
}

function DocRow({
  ev,
  blurry,
  busy,
  typeLabel,
  onPreview,
  onType,
  onRemove,
}: {
  ev: Evidence
  blurry: boolean
  busy: boolean
  typeLabel: (x: EvidenceType) => string
  onPreview: () => void
  onType: (x: EvidenceType) => void
  onRemove: () => void
}) {
  const { t } = useBorrower()
  const review = ev.status === 'needs_review'
  const excluded = ev.status === 'excluded'
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: excluded ? 0.72 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`rounded-2xl border-2 p-2.5 ${review ? 'border-turmeric bg-turmeric-soft/40' : 'border-soot/10 bg-card'}`}
    >
      <div className="flex items-center gap-3">
        <button type="button" onClick={onPreview} className="h-14 w-11 shrink-0 overflow-hidden rounded-md bg-paper-3 shadow-sm" aria-label={ev.label}>
          <img src={ev.url} alt="" className="h-full w-full object-cover object-top" draggable={false} />
        </button>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
            {ev.original_name?.toLowerCase().endsWith('.pdf') ? <FileText size={15} className="shrink-0 text-soot-2" aria-hidden /> : null}
            <span className="truncate">
              {typeLabel(ev.type)}
              {ev.page ? ` · ${t('pageOf', { n: ev.page })}` : ''}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-soot-2">
            {excluded ? <span className="font-bold">{t('notUsed')}</span> : review ? <span className="font-bold text-turmeric-deep">{t('pleaseCheck')}</span> : ev.label_source === 'ai' ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles size={12} aria-hidden /> {t('aiSays')}
              </span>
            ) : null}
            {blurry ? <span className="font-bold text-turmeric-deep">· {t('mayBeBlurry')}</span> : null}
            {ev.read_kind && ev.read_kind !== 'daily_records' ? (
              <span className="basis-full font-bold text-chili-ink">{ev.read_kind === 'period_summary' ? t('readSummaryPage') : ev.read_kind === 'unreadable' ? t('readUnclear') : t('readNotRecords')}</span>
            ) : null}
            {ev.original_name ? <span className="max-w-[160px] truncate">· {ev.original_name}</span> : null}
          </span>
        </span>
        <button type="button" onClick={onRemove} disabled={busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-soot-2 hover:bg-chili/8 hover:text-chili-ink" aria-label={`${t('removeDoc')} ${typeLabel(ev.type)}`}>
          {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <Trash2 size={18} aria-hidden />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-14">
        {review && ev.type !== 'other' ? (
          <>
            <span className="text-[13.5px] font-bold text-soot">{t('isThisRight', { type: typeLabel(ev.type).toLowerCase() })}</span>
            <button type="button" onClick={() => onType(ev.type)} disabled={busy} className="inline-flex min-h-[38px] items-center gap-1 rounded-full bg-leaf px-3 text-[13.5px] font-bold text-paper">
              <Check size={15} strokeWidth={3} aria-hidden /> {t('yes')}
            </button>
          </>
        ) : null}
        <label className="relative inline-flex min-h-[38px] items-center">
          <span className="sr-only">{t('changeType')}</span>
          <select
            value={ev.type}
            disabled={busy}
            onChange={(e) => onType(e.target.value as EvidenceType)}
            className="min-h-[38px] appearance-none rounded-full border-2 border-soot/15 bg-paper py-1 pl-3 pr-8 text-[13.5px] font-bold text-ink"
          >
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {typeLabel(x)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 text-[11px] text-soot-2" aria-hidden>
            ▼
          </span>
        </label>
      </div>
    </motion.li>
  )
}
