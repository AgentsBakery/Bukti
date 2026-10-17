import { ArrowRight, Eye, Plus, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import type { ApplicationSummary, Lang } from '../api/types'
import { GoogleG } from '../auth/UserChip'
import { useAuth } from '../auth/AuthContext'
import { KawungLoader } from '../components/Kawung'
import { translate, type StringKey } from '../i18n/strings'
import { fmtDateTime, money } from '../lib/format'
import { useTitle } from '../lib/hooks'
import { defaultLang } from '../lib/prefs'
import { ApplyShell } from './shell'

function statusKey(a: ApplicationSummary): { key: StringKey; tone: string } {
  if (a.status === 'decided')
    return a.decision === 'decline' ? { key: 'statusDeclined', tone: 'bg-chili/10 text-chili-ink' } : { key: 'statusApproved', tone: 'bg-leaf/12 text-leaf-ink' }
  if (a.status === 'draft') return { key: 'statusDraft', tone: 'bg-paper-3 text-soot' }
  if (a.status === 'extracting') return { key: 'statusReading', tone: 'bg-paper-3 text-soot' }
  if (a.status === 'extracted') return { key: 'statusInterview', tone: 'bg-turmeric-soft/60 text-turmeric-deep' }
  return { key: 'statusReview', tone: 'bg-turmeric-soft/60 text-turmeric-deep' }
}

export default function MyApplications() {
  const { status, user, signIn, enabled } = useAuth()
  const [lang] = useState<Lang>(defaultLang)
  const [items, setItems] = useState<ApplicationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ApplicationSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const t = (k: StringKey, v?: Record<string, string | number>) => translate(lang, k, v)
  useTitle('Bukti · My applications')

  const load = useCallback(() => {
    api.myApplications().then(setItems, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => {
    if (user) load()
  }, [user, load])

  const remove = async () => {
    if (!confirm) return
    setDeleting(true)
    try {
      await api.deleteApplication(confirm.id)
      setConfirm(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ApplyShell>
      <div className="flex flex-wrap items-end justify-between gap-3" lang={lang}>
        <h1 className="font-display text-[clamp(34px,8vw,46px)] leading-none text-ink">{t('myTitle')}</h1>
        {user ? (
          <Link to="/start" className="btn-ink min-h-[48px] !px-4 text-[15.5px]">
            <Plus size={19} aria-hidden /> {t('newApplication')}
          </Link>
        ) : null}
      </div>

      {status === 'loading' ? (
        <div className="mt-10 grid place-items-center">
          <KawungLoader size={36} />
        </div>
      ) : !user ? (
        <div className="paper-card mt-7 p-5" lang={lang}>
          <p className="text-[16px] text-soot">{t('signInWhy')}</p>
          <button type="button" className="btn-paper mt-4 w-full" onClick={() => void signIn()} disabled={!enabled}>
            <GoogleG size={20} /> {t('signInToApply')}
          </button>
        </div>
      ) : !items ? (
        <div className="mt-10 grid place-items-center">{error ? <p className="font-bold text-chili-ink">{error}</p> : <KawungLoader size={36} />}</div>
      ) : !items.length ? (
        <div className="paper-card mt-7 p-6 text-center" lang={lang}>
          <p className="font-hand text-[20px] text-soot-2">{t('myEmpty')}</p>
          <Link to="/start" className="btn-ink mt-4 inline-flex">
            {t('startTitle')} <ArrowRight size={20} aria-hidden />
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3" lang={lang}>
          {items.map((a, i) => {
            const s = statusKey(a)
            return (
              <motion.li key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="paper-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-extrabold text-ink">{a.persona.business}</p>
                    <p className="truncate text-[13.5px] text-soot-2">
                      {a.persona.name}
                      {a.persona.city ? ` · ${a.persona.city}` : ''} · {fmtDateTime(a.created_at)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-[12.5px] font-bold ${s.tone}`}>{t(s.key)}</span>
                </div>
                {a.amount ? <p className="font-mono tnum mt-2 text-[15px] font-bold text-ink">{money(a.amount, a.market)}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/apply/${a.id}`} className="btn-ink min-h-[44px] !px-4 text-[14.5px]">
                    {t('openApp')} <ArrowRight size={17} aria-hidden />
                  </Link>
                  <Link to={`/console/${a.id}`} className="btn-paper min-h-[44px] !px-4 text-[14.5px]">
                    <Eye size={17} aria-hidden /> {t('officerView')}
                  </Link>
                  <button type="button" onClick={() => setConfirm(a)} className="ml-auto flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[14px] font-bold text-chili-ink hover:bg-chili/8">
                    <Trash2 size={16} aria-hidden /> {t('deleteApp')}
                  </button>
                </div>
              </motion.li>
            )
          })}
        </ul>
      )}

      <Dialog.Root open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-soot/50" />
          <Dialog.Content className="paper-card fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 p-5" lang={lang}>
            <Dialog.Title className="font-display text-[24px] text-ink">{t('deleteApp')}</Dialog.Title>
            <Dialog.Description className="mt-2 text-[15.5px] leading-snug text-soot">{t('deleteConfirm')}</Dialog.Description>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Dialog.Close className="btn-paper">{t('cancel')}</Dialog.Close>
              <button type="button" className="btn-ink !bg-chili" onClick={() => void remove()} disabled={deleting}>
                {deleting ? <KawungLoader size={20} /> : <Trash2 size={18} aria-hidden />} {t('removeDoc')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ApplyShell>
  )
}
