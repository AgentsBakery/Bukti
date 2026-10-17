import { ArrowRight, Check, ListChecks, ShieldCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api'
import type { Lang, Market } from '../api/types'
import { GoogleG } from '../auth/UserChip'
import { useAuth } from '../auth/AuthContext'
import { KawungLoader } from '../components/Kawung'
import { LANG_LABEL, translate, type StringKey } from '../i18n/strings'
import { useTitle } from '../lib/hooks'
import { defaultLang, remember } from '../lib/prefs'
import { ApplyShell } from './shell'

const ease = [0.22, 0.8, 0.24, 1] as const

export default function StartPage() {
  const { status, enabled, user, signIn, error: authError } = useAuth()
  const navigate = useNavigate()
  const [lang, setLang] = useState<Lang>(defaultLang)
  const [nameEdit, setName] = useState<string | null>(null)
  const name = nameEdit ?? user?.name ?? ''
  const [business, setBusiness] = useState('')
  const [city, setCity] = useState('')
  const [market, setMarket] = useState<Market>(() => (defaultLang() === 'ta' ? 'IN' : 'ID'))
  const [photos, setPhotos] = useState(false)
  const [voice, setVoice] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = (k: StringKey, v?: Record<string, string | number>) => translate(lang, k, { rail: market === 'ID' ? 'QRIS' : 'UPI', ...v })
  useTitle('Bukti · Apply')

  const pickLang = (l: Lang) => {
    setLang(l)
    remember('bukti.lang.default', l)
    if (l === 'ta') setMarket('IN')
    if (l === 'id') setMarket('ID')
  }

  const ready = name.trim() && business.trim() && photos && !busy
  const submit = async () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const { application_id } = await api.createApplication({
        market,
        language: lang,
        persona: { name: name.trim(), business: business.trim(), city: city.trim() },
        consent: { photos, voice },
      })
      remember(`bukti.lang.${application_id}`, lang)
      navigate(`/apply/${application_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorGeneric'))
      setBusy(false)
    }
  }

  return (
    <ApplyShell>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('language')}>
        {(['id', 'ta', 'en'] as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            onClick={() => pickLang(l)}
            className={`min-h-[44px] rounded-full border-2 px-4 text-[15px] font-bold transition-colors ${lang === l ? 'border-ink bg-ink text-paper' : 'border-soot/15 bg-card text-ink hover:border-ink/40'}`}
          >
            {LANG_LABEL[l].native}
          </button>
        ))}
      </div>

      <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="font-display mt-6 text-[clamp(34px,8vw,48px)] leading-[1.02] text-ink" lang={lang}>
        {t('startTitle')}
      </motion.h1>
      <p className="mt-3 text-[17px] leading-snug text-soot-2" lang={lang}>
        {t('startLead')}
      </p>

      {status === 'loading' ? (
        <div className="mt-10 grid place-items-center">
          <KawungLoader size={36} />
        </div>
      ) : !user ? (
        <div className="paper-card mt-7 p-5" lang={lang}>
          <p className="text-[16px] leading-snug text-soot">{t('signInWhy')}</p>
          <button type="button" className="btn-paper mt-4 w-full" onClick={() => void signIn()} disabled={!enabled}>
            <GoogleG size={20} /> {t('signInToApply')}
          </button>
          {authError ? (
            <p className="mt-3 text-[14.5px] font-bold text-chili-ink" role="alert">
              {authError}
            </p>
          ) : null}
        </div>
      ) : (
        <form
          className="mt-7 grid gap-5"
          lang={lang}
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label={t('fieldName')}>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required />
          </Field>
          <Field label={t('fieldBusiness')} hint={t('fieldBusinessHint')}>
            <input className="field" value={business} onChange={(e) => setBusiness(e.target.value)} maxLength={80} required />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('fieldCity')}>
              <input className="field" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-[15px] font-bold text-soot">{t('fieldCountry')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['ID', 'IN'] as Market[]).map((m) => (
                  <label key={m} className={`flex min-h-[52px] cursor-pointer items-center justify-center rounded-2xl border-2 text-[15.5px] font-bold ${market === m ? 'border-ink bg-ink text-paper' : 'border-soot/15 bg-card text-ink'}`}>
                    <input type="radio" name="market" value={m} checked={market === m} onChange={() => setMarket(m)} className="sr-only" />
                    {m === 'ID' ? t('countryID') : t('countryIN')}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <section className="paper-card p-4">
            <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-ink">
              <ShieldCheck size={19} className="text-leaf" aria-hidden /> {t('consentTitle')}
            </h2>
            <Consent checked={photos} onChange={setPhotos} required>
              {t('consentPhotos')}
            </Consent>
            <Consent checked={voice} onChange={setVoice}>
              {t('consentVoice')}
            </Consent>
            <p className="mt-3 text-[13.5px] leading-snug text-soot-2">{t('consentNote')}</p>
          </section>

          {error ? (
            <p className="text-[15px] font-bold text-chili-ink" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-ink w-full" disabled={!ready}>
            {busy ? <KawungLoader size={22} /> : null} {t('startButton')} <ArrowRight size={22} aria-hidden />
          </button>
          <Link to="/me" className="link-ink mx-auto flex min-h-[44px] items-center gap-2 text-[15px]">
            <ListChecks size={18} aria-hidden /> {t('myTitle')}
          </Link>
        </form>
      )}
    </ApplyShell>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-bold text-soot">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[13.5px] text-soot-2">{hint}</span> : null}
    </label>
  )
}

function Consent({ checked, onChange, required, children }: { checked: boolean; onChange: (v: boolean) => void; required?: boolean; children: ReactNode }) {
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl p-1">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} required={required} />
      <span
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-turmeric ${checked ? 'border-leaf bg-leaf text-paper' : 'border-soot/30 bg-paper'}`}
        aria-hidden
      >
        {checked ? <Check size={17} strokeWidth={3} /> : null}
      </span>
      <span className="text-[15.5px] leading-snug text-soot">{children}</span>
    </label>
  )
}
