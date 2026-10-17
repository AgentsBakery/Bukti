import { ArrowLeft, Inbox } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useCallback, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, IS_MOCK } from '../api'
import type { ApplicationSummary } from '../api/types'
import { KawungLoader } from '../components/Kawung'
import { Logo } from '../components/Logo'
import { fmtTime, initials, money } from '../lib/format'
import { useTitle } from '../lib/hooks'
import { usePoll } from '../lib/useApplication'
import { ConsoleView, STATUS_LABEL } from './ConsoleView'

function Queue({ items, current }: { items: ApplicationSummary[] | null; current?: string }) {
  return (
    <section className="paper-card flex h-full min-h-0 flex-col overflow-hidden" aria-label="Application queue">
      <header className="flex shrink-0 items-center justify-between border-b border-soot/10 px-3 py-2.5">
        <h2 className="eyebrow flex items-center gap-1.5 !text-[10.5px]">
          <Inbox size={13} aria-hidden /> Queue
        </h2>
        <span className="font-mono text-[11px] text-soot-3">{items?.length ?? 0}</span>
      </header>
      <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
        {!items ? (
          <li className="p-6">
            <KawungLoader size={26} />
          </li>
        ) : null}
        {items?.map((a) => {
          const on = a.id === current
          return (
            <li key={a.id}>
              <Link
                to={`/console/${a.id}`}
                aria-current={on ? 'page' : undefined}
                className={`flex items-start gap-2.5 rounded-xl p-2.5 transition-colors ${on ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
              >
                <span className={`font-display grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-bold ${on ? 'bg-paper text-ink' : 'bg-paper-3 text-ink'}`}>{initials(a.persona)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-extrabold">{a.persona.name}</span>
                    <span className={`font-mono shrink-0 text-[10px] ${on ? 'text-paper/60' : 'text-soot-3'}`}>{fmtTime(a.created_at).slice(0, 5)}</span>
                  </span>
                  <span className={`block truncate text-[11.5px] ${on ? 'text-paper/70' : 'text-soot-2'}`}>
                    {a.persona.business.replace(/\s*\(claimed\)/i, '')} · {a.persona.city}
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-[11px] font-bold">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <i className={`h-1.5 w-1.5 rounded-full ${a.status === 'decided' ? 'bg-leaf' : a.status === 'ready' ? 'bg-turmeric' : 'bg-soot/35'}`} />
                      <span className={on ? 'text-paper/85' : 'text-soot-2'}>{STATUS_LABEL[a.status]}</span>
                    </span>
                    {a.amount ? <span className={`font-mono tnum ${on ? 'text-paper' : 'text-ink'}`}>{money(a.amount, a.market)}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
        {items && !items.length ? <li className="p-4 text-[13px] text-soot-3">No applications yet. Open a demo pack from the home page.</li> : null}
      </ul>
    </section>
  )
}

export default function ConsolePage() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const queue = usePoll(() => api.listApplications(), 2500)
  useTitle('Bukti · Loan officer console')

  useEffect(() => {
    if (!appId && queue?.length) navigate(`/console/${queue[0].id}`, { replace: true })
  }, [appId, queue, navigate])

  const prevNext = useCallback(
    (d: -1 | 1) => {
      if (!queue?.length) return
      const i = queue.findIndex((a) => a.id === appId)
      const next = queue[(i + d + queue.length) % queue.length]
      if (next) navigate(`/console/${next.id}`)
    },
    [queue, appId, navigate],
  )

  return (
    <div className="kraft flex h-dvh flex-col overflow-hidden text-soot">
      <header className="relative flex h-14 shrink-0 items-center justify-between overflow-hidden bg-ink px-5 text-paper">
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'var(--kawung)', backgroundSize: '22px 22px', filter: 'invert(1)' }} aria-hidden />
        <div className="relative flex items-center gap-4">
          <Logo size={26} tone="paper" />
          <span className="h-5 w-px bg-paper/25" aria-hidden />
          <span className="text-[14px] font-bold tracking-wide text-paper/85">Loan officer console</span>
          {IS_MOCK ? <span className="rounded-full border border-paper/25 px-2 py-0.5 text-[11px] text-paper/70">offline demo data</span> : null}
        </div>
        <div className="relative flex items-center gap-2">
          {/* below 1500px the queue column folds into this menu */}
          <Popover.Root>
            <Popover.Trigger className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-bold text-paper/80 hover:bg-white/10 hover:text-paper min-[1500px]:hidden">
              <Inbox size={15} aria-hidden /> Queue ({queue?.length ?? 0})
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={8} className="z-50 h-[min(70vh,560px)] w-[300px] data-[state=open]:animate-[fade-up_.18s_ease]">
                <Queue items={queue} current={appId} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Link to="/" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-bold text-paper/80 hover:bg-white/10 hover:text-paper">
            <ArrowLeft size={15} aria-hidden /> Demo home
          </Link>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col p-3">
        {appId ? (
          <ConsoleView key={appId} appId={appId} onPrevNext={prevNext} left={<Queue items={queue} current={appId} />} />
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-3">
            <Queue items={queue} />
            <div className="paper-card grid place-items-center p-10 text-center">
              {queue && !queue.length ? (
                <div>
                  <p className="font-display text-[26px] text-ink">The desk is clear.</p>
                  <p className="mt-2 text-soot-2">Open a demo pack from the home page to start an application.</p>
                  <Link to="/" className="btn-paper mt-5">
                    Go to demo packs
                  </Link>
                </div>
              ) : (
                <KawungLoader size={36} label="Fetching the queue…" />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
