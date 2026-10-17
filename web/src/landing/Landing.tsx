import { ArrowRight, ChevronDown, LayoutDashboard, Mic, NotebookPen, ScanSearch, ShieldCheck, UserRoundCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { Collapsible } from 'radix-ui'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, IS_MOCK } from '../api'
import type { DemoPack } from '../api/types'
import { Kawung } from '../components/Kawung'
import { Logo } from '../components/Logo'
import { Stamp } from '../components/Stamp'
import { HeroIllustration } from './HeroIllustration'
import { UserChip } from '../auth/UserChip'

const ease = [0.22, 0.8, 0.24, 1] as const

const HERO_CARDS = [
  {
    pack: 'sari',
    kicker: 'Bahasa Indonesia',
    title: 'Be Ibu Sari',
    who: 'Warung sembako · Yogyakarta',
    line: 'Twelve years of takings in a school notebook, and a QRIS sticker by the till.',
    cta: 'Start in Bahasa',
    img: '/mock/sari/page1.jpg',
    tone: 'ink' as const,
  },
  {
    pack: 'murugan',
    kicker: 'தமிழ்',
    title: 'Be Murugan',
    who: 'Kirana store · Madurai',
    line: 'A kanakku book, UPI on every second sale, and a plan to buy rice in bulk.',
    cta: 'Start in Tamil',
    img: '/mock/murugan/page1.jpg',
    tone: 'ink' as const,
  },
  {
    pack: 'rina',
    kicker: 'Fabricated pack',
    title: 'Watch a fake ledger get caught',
    who: 'Ibu Rina · Bantul',
    line: 'Round numbers, written in one sitting — with sales on days QRIS says the shop was shut.',
    cta: 'Catch it',
    img: '/mock/rina/page1.jpg',
    tone: 'chili' as const,
  },
]

const LABEL_TONE: Record<DemoPack['label'], 'pass' | 'warn' | 'fail'> = { genuine: 'pass', inflated: 'warn', fabricated: 'fail' }

function useOpenPack() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = async (packId: string) => {
    if (busy) return
    setBusy(packId)
    setError(null)
    try {
      const { application_id } = await api.loadPack(packId)
      navigate(window.innerWidth >= 1100 ? `/demo/${application_id}` : `/apply/${application_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }
  return { open, busy, error }
}

function PersonaCard({ c, i, busy, onOpen }: { c: (typeof HERO_CARDS)[number]; i: number; busy: string | null; onOpen: () => void }) {
  const loading = busy === c.pack
  const fake = c.tone === 'chili'
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      disabled={!!busy}
      initial={{ opacity: 0, y: 30, rotate: [-1.4, 0.8, -0.6][i] }}
      animate={{ opacity: 1, y: 0, rotate: [-1.4, 0.8, -0.6][i] }}
      whileHover={{ y: -6, rotate: 0 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.7, ease, delay: 0.9 + i * 0.12 }}
      className="group relative flex min-h-[318px] flex-col overflow-hidden rounded-[20px] bg-card text-left shadow-[0_1px_0_rgb(255_255_255/0.7)_inset,0_2px_4px_rgb(60_40_10/0.08),0_26px_50px_-30px_rgb(60_40_10/0.7)] ring-1 ring-soot/10 transition-shadow hover:shadow-[0_1px_0_rgb(255_255_255/0.7)_inset,0_2px_4px_rgb(60_40_10/0.08),0_36px_60px_-30px_rgb(60_40_10/0.85)] disabled:cursor-wait"
      aria-label={`${c.title} — ${c.who}`}
    >
      {/* washi tape */}
      <span
        className="absolute -top-1 left-1/2 z-20 h-6 w-24 -translate-x-1/2 rotate-[-3deg] opacity-80"
        style={{ background: fake ? 'color-mix(in srgb, var(--color-chili) 55%, #f3b8a8)' : 'color-mix(in srgb, var(--color-turmeric) 70%, #fff3cf)', maskImage: 'var(--hl-mask)', WebkitMaskImage: 'var(--hl-mask)', maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}
        aria-hidden
      />
      {/* a strip of the actual notebook */}
      <div className="relative h-[118px] overflow-hidden border-b border-soot/10">
        <img src={c.img} alt="" className="absolute inset-x-0 top-[-14px] w-full scale-[1.06] object-cover object-top opacity-95 transition-transform duration-700 group-hover:scale-[1.1]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
        {fake ? (
          <div className="absolute right-4 top-5">
            <Stamp tone="fail" rotate={-9} size={13}>
              Fabricated?
            </Stamp>
          </div>
        ) : null}
      </div>
      <div className="relative flex flex-1 flex-col px-6 pb-5 pt-3">
        <span className={`text-[13px] font-extrabold uppercase tracking-[0.14em] ${fake ? 'text-chili-ink' : 'text-turmeric-deep'}`} lang={c.pack === 'murugan' ? 'ta' : undefined}>
          {c.kicker}
        </span>
        <span className="font-display mt-1 text-[30px] leading-[1.05] text-ink">{c.title}</span>
        <span className="mt-1 text-[14.5px] font-bold text-soot-2">{c.who}</span>
        <span className="mt-2 text-[15px] leading-snug text-soot-2">{c.line}</span>
        <span className={`mt-auto flex items-center gap-2 pt-4 text-[16px] font-extrabold ${fake ? 'text-chili-ink' : 'text-ink'}`}>
          {loading ? (
            <>
              <Kawung size={20} spin /> Opening the shoebox…
            </>
          ) : (
            <>
              {c.cta}
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden />
            </>
          )}
        </span>
      </div>
    </motion.button>
  )
}

export default function Landing() {
  const { open, busy, error } = useOpenPack()
  const [packs, setPacks] = useState<DemoPack[] | null>(null)
  useEffect(() => {
    api.listPacks().then(setPacks, () => setPacks([]))
  }, [])
  const more = (packs ?? []).filter((p) => !HERO_CARDS.some((c) => c.pack === p.id))

  return (
    <div className="grain min-h-dvh overflow-x-hidden bg-paper">
      {/* kawung band */}
      <div className="relative h-2.5 overflow-hidden bg-ink" aria-hidden>
        <div className="absolute inset-0" style={{ backgroundImage: 'var(--kawung)', backgroundSize: '14px 14px', filter: 'invert(1)', opacity: 0.18 }} />
      </div>
      <header className="mx-auto flex max-w-[1380px] items-center justify-between px-5 pt-6 sm:px-10">
        <Logo size={34} />
        <div className="flex items-center gap-3">
          {IS_MOCK ? <span className="chip hidden sm:inline-flex">Offline demo data</span> : null}
          <Link to="/console" className="link-ink flex min-h-[44px] items-center gap-2 text-[15px]">
            <LayoutDashboard size={18} aria-hidden /> <span className="hidden sm:inline">Loan officer console</span>
            <span className="sm:hidden">Console</span>
          </Link>
          <UserChip />
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-5 pb-16 sm:px-10">
        <section className="grid items-center gap-6 pt-8 min-[1100px]:grid-cols-[1.05fr_1fr] min-[1100px]:pt-10">
          <div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="eyebrow flex items-center gap-2">
              <Kawung size={16} /> Explainable credit for informal micro-business
            </motion.p>
            <h1 className="font-display mt-5 text-[clamp(44px,6.6vw,92px)] leading-[0.98] text-ink">
              <motion.span className="block" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.08 }}>
                Credit from the
              </motion.span>
              <motion.span className="relative block" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.18 }}>
                <span className="relative inline-block">
                  <motion.span
                    className="hl absolute -inset-x-2 bottom-[4%] top-[42%]"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.75, ease: [0.3, 0.7, 0.2, 1], delay: 0.85 }}
                    aria-hidden
                  />
                  <span className="relative italic">proof</span>
                </span>{' '}
                people
              </motion.span>
              <motion.span className="block" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.28 }}>
                already keep.
                <motion.span
                  className="font-hand ml-4 inline-block -rotate-3 align-middle text-[clamp(17px,1.5vw,23px)] font-normal not-italic leading-tight text-turmeric-deep"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.5, duration: 0.6 }}
                >
                  ↖ <em className="not-italic">bukti</em> means
                  <br />
                  &nbsp;&nbsp;&nbsp;“proof” in Bahasa
                </motion.span>
              </motion.span>
            </h1>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.45 }} className="mt-7 max-w-[34ch] text-[clamp(19px,1.6vw,23px)] leading-snug text-soot">
              Ibu Sari has kept her warung’s books for twelve years. In a notebook.{' '}
              <span className="font-display italic text-ink">No bank will read it.</span>
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.55 }} className="mt-4 max-w-[54ch] text-[16.5px] leading-relaxed text-soot-2">
              Bukti reads the notebook, checks it against her QRIS payments, listens to her story in her own language, and drafts a loan a human officer can approve — with every number traceable to the line it came from.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.65 }} className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link to="/start" className="btn-ink">
                <NotebookPen size={21} aria-hidden /> Apply with your own records <ArrowRight size={20} aria-hidden />
              </Link>
              <a href="#demos" className="link-ink flex min-h-[44px] items-center text-[16px]">
                or try a one-click demo ↓
              </a>
            </motion.div>
          </div>
          <motion.div className="relative hidden origin-center min-[1100px]:block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <div className="origin-center scale-[0.92] 2xl:scale-100">
              <HeroIllustration />
            </div>
          </motion.div>
        </section>

        <section id="demos" aria-label="Try a demo" className="mt-10 scroll-mt-6 min-[1100px]:mt-4">
          <div className="grid gap-6 md:grid-cols-3">
            {HERO_CARDS.map((c, i) => (
              <PersonaCard key={c.pack} c={c} i={i} busy={busy} onOpen={() => void open(c.pack)} />
            ))}
          </div>
          {error ? (
            <p className="mt-4 font-bold text-chili-ink" role="alert">
              Couldn’t open that pack: {error}
            </p>
          ) : null}

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-start">
            <Link to="/console" className="btn-paper shrink-0">
              <LayoutDashboard size={20} aria-hidden /> Open the loan officer console
            </Link>
            <Collapsible.Root className="min-w-0 flex-1">
              <Collapsible.Trigger className="group flex min-h-[56px] items-center gap-2 rounded-2xl px-3 text-[16px] font-bold text-ink hover:bg-paper-2">
                More demo packs
                <ChevronDown size={18} className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </Collapsible.Trigger>
              <Collapsible.Content className="data-[state=open]:animate-[fade-up_.25s_ease]">
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {more.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void open(p.id)}
                        disabled={!!busy}
                        className="paper-card flex min-h-[64px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-transform hover:-translate-y-0.5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[15.5px] font-bold text-ink">{p.persona.name}</span>
                          <span className="block truncate text-[13px] text-soot-2">
                            {p.persona.business} · {p.persona.city} · {p.language === 'ta' ? 'தமிழ்' : p.language === 'id' ? 'Bahasa' : 'English'}
                          </span>
                        </span>
                        {busy === p.id ? <Kawung size={22} spin /> : <Stamp tone={LABEL_TONE[p.label]} rotate={-4} size={10.5}>{p.label}</Stamp>}
                      </button>
                    </li>
                  ))}
                  {packs && !more.length ? <li className="text-soot-2">No other packs available.</li> : null}
                </ul>
              </Collapsible.Content>
            </Collapsible.Root>
          </motion.div>
        </section>

        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.7, ease }} className="mt-16 border-t border-soot/12 pt-10" aria-label="How Bukti works">
          <h2 className="eyebrow">How it works</h2>
          <ol className="mt-5 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { Icon: NotebookPen, t: 'Foto', d: 'Gemini reads each notebook line. Every number keeps a box back to its photo.' },
              { Icon: Mic, t: 'Cerita', d: 'A short voice interview in Bahasa or Tamil fills what the page can’t say.' },
              { Icon: ScanSearch, t: 'Proof chain', d: 'Agents reconcile with QRIS/UPI, test for fabrication, and benchmark peers.' },
              { Icon: UserRoundCheck, t: 'A person decides', d: 'An officer approves with the memo, the photo and the reasons side by side.' },
            ].map(({ Icon, t, d }, i) => (
              <li key={t} className="flex gap-4">
                <span className="font-display grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink text-ink">
                  <Icon size={21} aria-hidden />
                </span>
                <span>
                  <span className="font-display block text-[21px] text-ink">
                    <span className="mr-1.5 text-soot-3">{i + 1}.</span>
                    {t}
                  </span>
                  <span className="mt-1 block text-[15px] leading-snug text-soot-2">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-10 flex items-start gap-2 text-[13.5px] text-soot-3">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
            Never used in a decision: gender, religion, ethnicity, marital status, age. Demo packs are synthetic — no real customer data.
          </p>
        </motion.section>
      </main>
    </div>
  )
}
