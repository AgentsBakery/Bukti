import { motion } from 'motion/react'
import type { Evidence } from '../api/types'
import { useBorrower } from './context'

const TILT = [-6, 4, -2.5, 5, -4, 2]

/** The shoebox: evidence photos dropped into a kraft tray, each stamped in with a little thud. */
export function EvidenceTray({ evidence, onOpen }: { evidence: Evidence[]; onOpen: (e: Evidence) => void }) {
  const { t, rail } = useBorrower()
  const label = (e: Evidence, i: number): [string, string?] => {
    if (e.type === 'ledger') {
      const n = evidence.filter((x) => x.type === 'ledger').indexOf(e) + 1
      return [t('evLedger'), t('pageShort', { n })]
    }
    if (e.type === 'statement') return [t('evStatement', { rail })]
    if (e.type === 'receipt') return [t('evReceipt'), String(i)]
    return [t('evShop')]
  }
  return (
    <div className="kraft relative rounded-[22px] p-3 pb-4 shadow-[inset_0_3px_0_rgb(255_255_255/0.25),inset_0_-6px_14px_rgb(60_40_10/0.35),0_14px_30px_-18px_rgb(60_40_10/0.7)]">
      {/* inner wall of the box */}
      <div className="pointer-events-none absolute inset-2 rounded-[16px] shadow-[inset_0_10px_18px_-8px_rgb(50_30_5/0.55),inset_0_-2px_0_rgb(255_255_255/0.2)]" />
      {evidence.length ? (
        <motion.p
          initial={{ opacity: 0, rotate: -6 }}
          animate={{ opacity: 1, rotate: -3 }}
          transition={{ delay: 0.4 + evidence.length * 0.22 }}
          className="font-hand absolute -top-4 right-4 z-10 rounded-md bg-paper px-2 text-[15px] text-turmeric-deep shadow-sm"
        >
          {t('trayReady', { n: evidence.length })} ✓
        </motion.p>
      ) : null}
      <ul className="relative flex min-h-[200px] flex-wrap items-end justify-center gap-x-1 gap-y-3 px-1 pt-4" aria-label="Evidence">
        {evidence.map((e, i) => (
          <motion.li
            key={e.id}
            initial={{ y: -90, opacity: 0, rotate: TILT[i % TILT.length] * 2.2, scale: 1.18 }}
            animate={{ y: 0, opacity: 1, rotate: TILT[i % TILT.length], scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 19, mass: 0.9, delay: 0.25 + i * 0.22 }}
            className="relative"
            style={{ marginLeft: i === 0 ? 0 : evidence.length > 3 ? -18 : -8, zIndex: i }}
          >
            <button
              type="button"
              onClick={() => onOpen(e)}
              className="group block rounded-[4px] bg-[#fdfbf6] p-[6px] pb-0 shadow-[0_1px_0_rgb(255_255_255/0.6)_inset,0_10px_18px_-8px_rgb(40_25_5/0.6)] transition-transform hover:-translate-y-1"
              aria-label={label(e, i).join(' ')}
            >
              <div className="h-[126px] w-[95px] overflow-hidden rounded-[2px] bg-paper-3">
                <img src={e.url} alt="" className="h-full w-full object-cover object-top" draggable={false} />
              </div>
              <div className="font-hand flex h-[40px] w-[95px] flex-col items-center justify-center px-0.5 text-center leading-[1.05] text-ink">
                <span className="text-[13px]">{label(e, i)[0]}</span>
                {label(e, i)[1] ? <span className="text-[12px] text-ink/70">{label(e, i)[1]}</span> : null}
              </div>
            </button>
          </motion.li>
        ))}
        {evidence.length === 0 ? <li className="font-hand self-center px-6 text-center text-[17px] text-ink/80">{t('trayEmpty')}</li> : null}
      </ul>
    </div>
  )
}
