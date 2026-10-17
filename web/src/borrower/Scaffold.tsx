import { Volume2, VolumeX } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useSpeech } from '../lib/speech'
import { useBorrower } from './context'

/** Round speaker button: reads the screen's instruction aloud in the borrower's language. */
export function SpeakerButton({ id, text, className = '' }: { id: string; text: string; className?: string }) {
  const { t, lang } = useBorrower()
  const { active, toggle } = useSpeech()
  const on = active === id
  return (
    <button
      type="button"
      onClick={() => toggle(id, { kind: 'tts', text, lang })}
      aria-pressed={on}
      aria-label={on ? t('stopReading') : t('readAloud')}
      className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 transition-colors ${
        on ? 'border-ink bg-ink text-paper' : 'border-ink/20 bg-card text-ink hover:border-ink/50'
      } ${className}`}
    >
      {on ? (
        <>
          <span className="absolute inset-0 rounded-full" style={{ animation: 'ring-pulse 1.2s ease-out infinite' }} aria-hidden />
          <VolumeX size={24} aria-hidden />
        </>
      ) : (
        <Volume2 size={24} aria-hidden />
      )}
    </button>
  )
}

/** Title row + scrolling body + a single primary action pinned to the bottom. */
export function StepScaffold({
  title,
  lead,
  speak,
  speakId,
  children,
  bottom,
  scroll = true,
}: {
  title: ReactNode
  lead?: ReactNode
  speak?: string
  speakId?: string
  children: ReactNode
  bottom?: ReactNode
  scroll?: boolean
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={scroll ? 'thin-scroll min-h-0 flex-1 overflow-y-auto' : 'flex min-h-0 flex-1 flex-col'}>
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 0.8, 0.24, 1] }}
          className="flex items-start gap-3 px-5 pt-4"
        >
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[29px] leading-[1.08] text-ink">{title}</h1>
            {lead ? <p className="mt-2 text-[16.5px] leading-snug text-soot-2">{lead}</p> : null}
          </div>
          {speak ? <SpeakerButton id={speakId ?? String(title)} text={speak} /> : null}
        </motion.header>
        {children}
      </div>
      {bottom ? (
        <div className="relative shrink-0 border-t border-soot/10 bg-paper/95 px-4 pb-4 pt-3 backdrop-blur">{bottom}</div>
      ) : null}
    </div>
  )
}
