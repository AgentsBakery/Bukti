import { ArrowLeft, ExternalLink, Smartphone } from 'lucide-react'
import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { IS_MOCK } from '../api'
import BorrowerApp from '../borrower/BorrowerApp'
import { ConsoleView } from '../console/ConsoleView'
import { UserChip } from '../auth/UserChip'
import { Logo } from '../components/Logo'
import { shortName } from '../lib/format'
import { useTitle } from '../lib/hooks'
import { useApplication } from '../lib/useApplication'

const SCREEN_W = 390
const SCREEN_H = 844
const BEZEL = 13

function StatusBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex h-[50px] items-center justify-between px-8 pt-1 text-soot" aria-hidden>
      <span className="text-[16px] font-bold tracking-tight" style={{ fontFamily: 'var(--font-sans)' }}>
        9:41
      </span>
      <span className="absolute left-1/2 top-[11px] h-[33px] w-[118px] -translate-x-1/2 rounded-full bg-[#0b0d18]" />
      <span className="flex items-center gap-1.5">
        <svg width="18" height="12" viewBox="0 0 18 12">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.6} y={9 - i * 2.8} width="3.2" height={3 + i * 2.8} rx="0.9" fill="currentColor" />
          ))}
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 11.2 5.6 8.8a3.4 3.4 0 0 1 4.8 0Z" />
          <path d="M3.6 6.8a6.2 6.2 0 0 1 8.8 0l-1.3 1.3a4.4 4.4 0 0 0-6.2 0Z" />
          <path d="M1.4 4.6a9.3 9.3 0 0 1 13.2 0l-1.3 1.3a7.5 7.5 0 0 0-10.6 0Z" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" opacity="0.4" />
          <rect x="2.2" y="2.2" width="16" height="8.6" rx="2.2" fill="currentColor" />
          <path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1Z" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </div>
  )
}

/** A tasteful device frame. Renders children at a true 390×844 and scales to fit. */
function PhoneFrame({ children, scale }: { children: ReactNode; scale: number }) {
  const W = SCREEN_W + BEZEL * 2
  const H = SCREEN_H + BEZEL * 2
  return (
    <div style={{ width: W * scale, height: H * scale }} className="relative shrink-0">
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {/* side buttons */}
        <span className="absolute -left-[3px] top-[170px] h-[34px] w-[4px] rounded-l bg-[#141938]" />
        <span className="absolute -left-[3px] top-[226px] h-[62px] w-[4px] rounded-l bg-[#141938]" />
        <span className="absolute -left-[3px] top-[300px] h-[62px] w-[4px] rounded-l bg-[#141938]" />
        <span className="absolute -right-[3px] top-[250px] h-[96px] w-[4px] rounded-r bg-[#141938]" />
        <div
          className="absolute inset-0 rounded-[64px]"
          style={{
            background: 'linear-gradient(145deg, #2c3566 0%, #1a2048 38%, #0e1230 100%)',
            boxShadow:
              '0 0 0 1.5px rgb(255 255 255 / 0.10) inset, 0 2px 0 rgb(255 255 255 / 0.12) inset, 0 50px 80px -30px rgb(30 25 10 / 0.55), 0 30px 40px -30px rgb(30 25 10 / 0.6), 0 0 0 1px rgb(0 0 0 / 0.35)',
          }}
        />
        <div className="absolute overflow-hidden rounded-[51px] bg-paper" style={{ left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H }}>
          {children}
          <StatusBar />
          <span className="pointer-events-none absolute bottom-[8px] left-1/2 z-50 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-soot/85" aria-hidden />
        </div>
      </div>
    </div>
  )
}

export default function DemoPage() {
  const { appId } = useParams()
  const { app } = useApplication(appId, 4000)
  useTitle(app ? `Bukti · Live demo · ${app.persona.name}` : 'Bukti · Live demo')
  const left = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = left.current
    if (!el) return
    const fit = () => {
      const availH = el.clientHeight - 64
      const availW = el.clientWidth - 40
      setScale(Math.max(0.55, Math.min(1, availH / (SCREEN_H + BEZEL * 2), availW / (SCREEN_W + BEZEL * 2))))
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    fit()
    return () => ro.disconnect()
  }, [])

  const lang = app?.language === 'ta' ? 'தமிழ்' : app?.language === 'en' ? 'English' : 'Bahasa Indonesia'

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-soot">
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-soot/12 bg-paper px-5">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] font-bold text-soot-2 hover:bg-paper-2 hover:text-ink" aria-label="Back to demo home">
            <ArrowLeft size={15} aria-hidden />
          </Link>
          <Logo size={24} />
          <span className="text-[13px] font-bold text-soot-2">Live demo — one application, two screens</span>
          {IS_MOCK ? <span className="chip !py-0 text-[11px]">offline demo data</span> : null}
        </div>
        <div className="flex items-center gap-2 text-[12.5px] font-bold">
          <Link to={`/apply/${appId}`} target="_blank" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-soot-2 hover:bg-paper-2 hover:text-ink">
            <Smartphone size={14} aria-hidden /> Phone only <ExternalLink size={12} aria-hidden />
          </Link>
          <Link to={`/console/${appId}`} target="_blank" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-soot-2 hover:bg-paper-2 hover:text-ink">
            Full console <ExternalLink size={12} aria-hidden />
          </Link>
          <UserChip />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* borrower side */}
        <div ref={left} className="grain relative flex w-[clamp(440px,27vw,540px)] shrink-0 flex-col items-center justify-center bg-paper">
          <div className="ruled pointer-events-none absolute inset-0 opacity-50" style={{ ['--rule' as string]: '34px' }} aria-hidden />
          <div className="pointer-events-none absolute bottom-0 left-[34px] top-0 w-px bg-margin/50" aria-hidden />
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative mb-3 flex items-baseline gap-2">
            <span className="font-hand text-[21px] leading-none text-ink">{app ? `${shortName(app.persona)}’s phone` : 'Borrower’s phone'}</span>
            <span className="text-[12px] font-bold text-soot-3">· {lang}</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 24, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.9, ease: [0.22, 0.8, 0.24, 1] }} className="relative">
            <PhoneFrame scale={scale}>
              <div data-borrower className="h-full w-full">
                {appId ? <BorrowerApp appId={appId} embedded /> : null}
              </div>
            </PhoneFrame>
          </motion.div>
        </div>
        {/* thread between the two */}
        <div className="relative w-0" aria-hidden>
          <div className="absolute inset-y-0 -left-px w-[2px]" style={{ backgroundImage: 'linear-gradient(to bottom, rgb(30 42 90 / .35) 50%, transparent 0)', backgroundSize: '2px 9px' }} />
        </div>
        {/* officer side */}
        <div className="kraft flex min-w-0 flex-1 flex-col p-3 pl-4">
          {appId ? <ConsoleView appId={appId} compact /> : null}
        </div>
      </div>
    </div>
  )
}
