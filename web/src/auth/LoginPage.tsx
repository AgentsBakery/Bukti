import { ArrowLeft, ArrowRight, Clock3, DoorOpen, PenLine, ShieldCheck, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Kawung } from '../components/Kawung'
import { Logo } from '../components/Logo'
import { Stamp } from '../components/Stamp'
import { useTitle } from '../lib/hooks'
import { useAuth } from './AuthContext'
import { Avatar, GoogleG } from './UserChip'

const ease = [0.22, 0.8, 0.24, 1] as const

/** The signed name, written onto the register's signature line. */
function Signature({ name }: { name: string }) {
  return (
    <motion.span
      className="font-hand block whitespace-nowrap text-[38px] leading-none text-ink"
      initial={{ clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      transition={{ duration: 1.1, ease: [0.45, 0.05, 0.3, 1] }}
      style={{ rotate: '-2deg' }}
    >
      {name}
    </motion.span>
  )
}

export default function LoginPage() {
  useTitle('Bukti · Officer sign-in')
  const { status, enabled, user, error, signIn, signOut } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next') || '/'
  const [busy, setBusy] = useState(false)
  const [justSigned, setJustSigned] = useState(false)
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  useEffect(() => {
    if (justSigned && user) {
      const t = window.setTimeout(() => navigate(next, { replace: true }), 1900)
      return () => window.clearTimeout(t)
    }
  }, [justSigned, user, next, navigate])

  const google = async () => {
    setBusy(true)
    const ok = await signIn()
    setBusy(false)
    if (ok) setJustSigned(true)
  }

  const btn =
    'group flex min-h-[64px] w-full items-center gap-3 rounded-[16px] border-2 border-ink bg-card px-3.5 text-left text-[16px] font-extrabold sm:gap-3.5 sm:px-5 sm:text-[17.5px] text-ink shadow-[0_-3px_0_rgb(30_42_90/0.16)_inset,0_10px_20px_-16px_rgb(30_42_90/0.9)] transition-[transform,background] hover:bg-white active:translate-y-[1px] disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-ink/45 disabled:shadow-none'

  return (
    <div className="kraft relative flex min-h-dvh flex-col overflow-hidden text-soot">
      {/* a pool of desk-lamp light */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 55% at 68% 42%, rgb(255 250 235 / 0.38), transparent 70%)' }} aria-hidden />
      <div className="relative h-2.5 overflow-hidden bg-ink" aria-hidden>
        <div className="absolute inset-0" style={{ backgroundImage: 'var(--kawung)', backgroundSize: '14px 14px', filter: 'invert(1)', opacity: 0.18 }} />
      </div>
      <header className="relative mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 pt-6 sm:px-10">
        <Link to="/" aria-label="Bukti home">
          <Logo size={32} />
        </Link>
        <Link to={next} className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-[14px] font-bold text-soot hover:bg-paper/40">
          <ArrowLeft size={16} aria-hidden /> Back to the demo
        </Link>
      </header>

      <main className="relative mx-auto grid w-full max-w-[1180px] flex-1 items-center gap-10 px-5 pb-16 pt-8 sm:px-10 min-[1000px]:grid-cols-[1fr_500px] min-[1000px]:gap-16 min-[1000px]:pb-24 min-[1000px]:pt-6">
        {/* the pitch */}
        <section>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="eyebrow flex items-center gap-2 !text-soot">
            <Kawung size={16} /> Loan officer sign-in · optional
          </motion.p>
          <h1 className="font-display mt-5 text-[clamp(46px,6.2vw,84px)] leading-[0.98] text-ink">
            <motion.span className="block" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.08 }}>
              Sign in,
            </motion.span>
            <motion.span className="block" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.18 }}>
              then{' '}
              <span className="relative inline-block">
                <motion.span
                  className="hl absolute -inset-x-2 bottom-[4%] top-[44%]"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, ease: [0.3, 0.7, 0.2, 1], delay: 0.8 }}
                  aria-hidden
                />
                <span className="relative italic">sign off.</span>
              </span>
            </motion.span>
          </h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.35 }} className="mt-7 max-w-[44ch] text-[clamp(17px,1.4vw,20px)] leading-snug text-soot">
            Your name goes on every decision you make, and your cases stay together. Borrowers never need an account — and the whole demo works without one.
          </motion.p>
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="mt-8 hidden max-w-[480px] gap-3.5 min-[1000px]:grid">
            {[
              { Icon: PenLine, t: 'Decisions carry your real name', d: 'The borrower sees who approved their loan.' },
              { Icon: ShieldCheck, t: 'Only your Google name, email and photo', d: 'Nothing else is read. Borrowers never see your email.' },
              { Icon: DoorOpen, t: 'Guests get everything', d: 'Every screen of the demo is open without signing in.' },
            ].map(({ Icon, t, d }) => (
              <li key={t} className="flex gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink/70 bg-paper/60 text-ink">
                  <Icon size={18} aria-hidden />
                </span>
                <span>
                  <span className="block text-[15.5px] font-extrabold text-soot">{t}</span>
                  <span className="block text-[14px] leading-snug text-soot">{d}</span>
                </span>
              </li>
            ))}
          </motion.ul>
        </section>

        {/* the register card */}
        <motion.section
          aria-label="Sign in"
          initial={{ opacity: 0, y: 30, rotate: 2.5 }}
          animate={{ opacity: 1, y: 0, rotate: -1 }}
          transition={{ duration: 0.9, ease, delay: 0.15 }}
          className="grain relative overflow-hidden rounded-[10px] bg-paper pb-8 pl-[50px] pr-4 pt-6 sm:pl-[64px] sm:pr-7 shadow-[0_1px_0_rgb(255_255_255/0.7)_inset,0_30px_60px_-30px_rgb(50_30_5/0.75),0_2px_4px_rgb(50_30_5/0.12)]"
        >
          <div className="ruled pointer-events-none absolute inset-0" style={{ ['--rule' as string]: '34px', ['--rule-offset' as string]: '20px' }} aria-hidden />
          <div className="pointer-events-none absolute bottom-0 left-[38px] top-0 w-[1.5px] bg-margin/70 sm:left-[48px]" aria-hidden />
          {/* binder holes */}
          <div className="pointer-events-none absolute left-[10px] top-0 flex h-full flex-col justify-around py-10 sm:left-[14px]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="kraft block h-[18px] w-[18px] rounded-full shadow-[inset_0_2px_3px_rgb(40_25_5/0.55)]" />
            ))}
          </div>
          <div className="pointer-events-none absolute -right-3 top-12 rotate-[14deg] opacity-[0.14]" aria-hidden>
            <Stamp tone="ink" size={15} rotate={0}>
              Meja petugas
            </Stamp>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow !text-[10.5px]">Officer register</p>
            <p className="font-mono tnum text-[11.5px] text-soot-2">{today}</p>
          </div>
          <h2 className="font-display mt-3 text-[28px] leading-tight text-ink sm:text-[32px]">{user ? `${justSigned ? 'Welcome' : 'Welcome back'}, ${user.name.split(/\s+/)[0]}` : 'Welcome to the desk'}</h2>
          <p className="font-hand mt-1 text-[18px] text-turmeric-deep">{user ? 'you’re signed in ✓' : 'pick either — both open the same demo'}</p>

          <div className="mt-6 grid gap-3">
            {user ? (
              <button type="button" className={btn} onClick={() => navigate(next)}>
                <Avatar user={user} size={34} ring="ring-card" />
                <span className="flex-1">Continue to the demo</span>
                <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" aria-hidden />
              </button>
            ) : (
              <>
                <button type="button" className={btn} onClick={() => void google()} disabled={!enabled || busy || status === 'loading'} aria-describedby={!enabled ? 'auth-off' : undefined}>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-soot/10">{busy ? <Kawung size={20} spin /> : <GoogleG size={19} />}</span>
                  <span className="flex-1">{busy ? 'Waiting for Google…' : 'Continue with Google'}</span>
                  <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" aria-hidden />
                </button>
                <div className="flex items-center gap-3 px-1" aria-hidden>
                  <span className="h-px flex-1 bg-soot/15" />
                  <span className="font-hand text-[17px] text-soot-2">atau · or</span>
                  <span className="h-px flex-1 bg-soot/15" />
                </div>
                <button type="button" className={btn} onClick={() => navigate(next)}>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-turmeric/35 text-ink">
                    <DoorOpen size={18} aria-hidden />
                  </span>
                  <span className="flex-1">Try the demo without signing in</span>
                  <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" aria-hidden />
                </button>
              </>
            )}
          </div>

          <AnimatePresence>
            {error ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 flex gap-2.5 rounded-xl border border-chili/30 bg-chili/8 p-3 text-[14px] leading-snug text-chili-ink"
                role="alert"
              >
                <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden /> {error}
              </motion.p>
            ) : null}
          </AnimatePresence>
          {!enabled && status !== 'loading' && !user ? (
            <p id="auth-off" className="mt-4 flex items-center gap-2 text-[14px] text-soot-2">
              <Clock3 size={16} className="shrink-0 text-turmeric-deep" aria-hidden /> Google sign-in is being set up. The demo is fully open in the meantime.
            </p>
          ) : null}

          {/* signature line */}
          <div className="relative mt-9">
            <div className="flex h-[52px] items-end pb-1">
              {user ? <Signature key={user.uid + String(justSigned)} name={user.name} /> : null}
            </div>
            <div className="h-[1.5px] w-full bg-ink/60" />
            <div className="mt-1 flex items-center justify-between">
              <span className="font-hand text-[15px] text-soot-2">tanda tangan · signature</span>
              {user ? (
                <button type="button" onClick={() => void signOut()} className="link-ink text-[13px]">
                  Not you? Sign out
                </button>
              ) : null}
            </div>
            <AnimatePresence>
              {user ? (
                <motion.div className="absolute -top-3 right-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Stamp tone="pass" land delay={justSigned ? 0.9 : 0.2} rotate={-8} size={13}>
                    Signed in ✓
                  </Stamp>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.section>
      </main>
    </div>
  )
}
