import { Camera, Check, MessageCircleHeart, Settings2, Stamp as StampIcon, SunMedium } from 'lucide-react'
import { motion } from 'motion/react'
import { Popover, Switch } from 'radix-ui'
import { useState } from 'react'
import type { Lang } from '../api/types'
import { Kawung } from '../components/Kawung'
import { LANG_LABEL, translate } from '../i18n/strings'
import { useBorrower, type Step } from './context'

const ORDER: Step[] = ['foto', 'cerita', 'hasil']

export function Stepper({ step, reachable }: { step: Step; reachable: Record<Step, boolean> }) {
  const { t, goto } = useBorrower()
  const items = [
    { s: 'foto' as Step, label: t('stepFoto'), Icon: Camera },
    { s: 'cerita' as Step, label: t('stepCerita'), Icon: MessageCircleHeart },
    { s: 'hasil' as Step, label: t('stepHasil'), Icon: StampIcon },
  ]
  const cur = ORDER.indexOf(step)
  return (
    <nav aria-label={t('stepOf', { n: cur + 1 })} className="relative flex-1">
      <ol className="relative flex items-start justify-between px-1">
        {/* connector */}
        <div className="absolute left-[16%] right-[16%] top-[20px] h-[2px]" aria-hidden>
          <div className="h-full w-full" style={{ backgroundImage: 'linear-gradient(to right, rgb(30 42 90 / .28) 50%, transparent 0)', backgroundSize: '7px 2px' }} />
          <motion.div className="absolute left-0 top-0 h-full bg-ink" initial={false} animate={{ width: `${cur * 50}%` }} transition={{ duration: 0.6, ease: [0.22, 0.8, 0.24, 1] }} />
        </div>
        {items.map(({ s, label, Icon }, i) => {
          const isCur = i === cur
          const done = i < cur
          const can = reachable[s] && !isCur
          return (
            <li key={s} className="relative z-10 flex w-[33%] flex-col items-center">
              <button
                type="button"
                disabled={!can}
                onClick={() => goto(s)}
                aria-current={isCur ? 'step' : undefined}
                aria-label={`${label}${done ? ' ✓' : ''}`}
                className={`relative grid h-[42px] w-[42px] place-items-center rounded-full border-2 transition-colors ${
                  isCur ? 'border-ink bg-ink text-paper shadow-[0_6px_14px_-6px_rgb(30_42_90/0.8)]' : done ? 'border-ink bg-paper text-ink' : 'border-ink/25 bg-paper text-ink/45'
                } ${can ? 'cursor-pointer hover:border-ink' : ''}`}
              >
                <Icon size={19} aria-hidden />
                {done ? (
                  <span className="absolute -right-1 -top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-turmeric text-ink ring-2 ring-paper">
                    <Check size={11} strokeWidth={3.6} aria-hidden />
                  </span>
                ) : null}
              </button>
              <span className={`mt-1 text-[12.5px] leading-none ${isCur ? 'font-extrabold text-ink' : 'font-bold text-soot-3'}`}>{label}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function SettingsMenu({ hc, setHc }: { hc: boolean; setHc: (v: boolean) => void }) {
  const { t, lang, setLang, portal } = useBorrower()
  return (
    <Popover.Root>
      <Popover.Trigger className="grid h-12 w-12 place-items-center rounded-full text-ink hover:bg-paper-2" aria-label={t('settings')}>
        <Settings2 size={22} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal container={portal ?? undefined}>
        <Popover.Content align="end" sideOffset={6} className="paper-card z-50 w-[272px] p-3 data-[state=open]:animate-[fade-up_.18s_ease]">
          <p className="eyebrow px-1 pb-2">{t('language')}</p>
          <div className="grid gap-1.5" role="radiogroup" aria-label={t('language')}>
            {(['id', 'ta', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                onClick={() => setLang(l)}
                className={`flex min-h-[48px] items-center justify-between rounded-xl px-3 text-left text-[16px] font-bold ${lang === l ? 'bg-ink text-paper' : 'bg-paper-2/70 text-ink'}`}
                lang={l}
              >
                {LANG_LABEL[l].native}
                {lang === l ? <Check size={18} aria-hidden /> : null}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-soot/10 px-1 pt-3">
            <label htmlFor="hc-switch" className="flex items-center gap-2.5">
              <SunMedium size={20} className="text-turmeric-deep" aria-hidden />
              <span>
                <span className="block text-[15px] font-bold text-soot">{t('highContrast')}</span>
                <span className="block text-[12.5px] text-soot-2">{t('highContrastHint')}</span>
              </span>
            </label>
            <Switch.Root
              id="hc-switch"
              checked={hc}
              onCheckedChange={setHc}
              className="relative h-[30px] w-[52px] shrink-0 rounded-full bg-soot/25 transition-colors data-[state=checked]:bg-ink"
            >
              <Switch.Thumb className="block h-[24px] w-[24px] translate-x-[3px] rounded-full bg-paper shadow transition-transform data-[state=checked]:translate-x-[25px]" />
            </Switch.Root>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

const PICK_TITLE: Record<Lang, string> = { id: 'Pilih bahasa', ta: 'மொழியைத் தேர்ந்தெடுக்கவும்', en: 'Choose your language' }
const PICK_GO: Record<Lang, string> = { id: 'Lanjut', ta: 'தொடரவும்', en: 'Continue' }

/** First run: language by its own script, never by flag. */
export function LanguagePicker({ initial, onPick }: { initial: Lang; onPick: (l: Lang) => void }) {
  const titles = PICK_TITLE
  const go = PICK_GO
  const [sel, setSel] = useState<Lang>(initial)
  const order: Lang[] = ['id', 'ta', 'en']
  return (
    <div className="flex h-full flex-col">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pt-8">
        <motion.div initial={{ opacity: 0, scale: 0.8, rotate: -30 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.8, ease: [0.22, 0.8, 0.24, 1] }} className="mb-6">
          <Kawung size={54} />
        </motion.div>
        <div className="space-y-1">
          {order.map((l, i) => (
            <motion.p
              key={l}
              lang={l}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1 }}
              className={`font-display leading-tight ${l === sel ? 'text-[30px] text-ink' : 'text-[19px] text-soot-3'}`}
              style={{ transition: 'font-size .3s, color .3s' }}
            >
              {titles[l]}
            </motion.p>
          ))}
        </div>
        <div className="mt-7 grid gap-3" role="radiogroup" aria-label="Language / Bahasa / மொழி">
          {order.map((l, i) => (
            <motion.button
              key={l}
              type="button"
              role="radio"
              aria-checked={sel === l}
              lang={l}
              onClick={() => setSel(l)}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.1, ease: [0.22, 0.8, 0.24, 1] }}
              className={`flex min-h-[84px] items-center justify-between rounded-[20px] border-2 px-5 text-left transition-colors ${
                sel === l ? 'border-ink bg-card shadow-[0_10px_24px_-14px_rgb(30_42_90/0.7)]' : 'border-soot/15 bg-card/50'
              }`}
            >
              <span>
                <span className={`block text-[24px] font-bold leading-tight ${l === 'ta' ? '' : 'font-display'} text-ink`}>{LANG_LABEL[l].native}</span>
                {l !== 'en' ? <span className="block text-[13.5px] font-bold text-soot-3" lang="en">{LANG_LABEL[l].english}</span> : null}
              </span>
              <span className={`grid h-9 w-9 place-items-center rounded-full border-2 ${sel === l ? 'border-ink bg-ink text-paper' : 'border-soot/25'}`}>
                {sel === l ? <Check size={20} strokeWidth={3} aria-hidden /> : null}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-4 pb-4 pt-3">
        <p className="font-hand mb-3 text-center text-[19px] text-turmeric-deep" lang={sel}>
          {translate(sel, 'appTagline')}
        </p>
        <button type="button" className="btn-ink w-full" onClick={() => onPick(sel)} lang={sel}>
          {go[sel]}
        </button>
      </div>
    </div>
  )
}
