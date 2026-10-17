import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { UserChip } from '../auth/UserChip'
import { Logo } from '../components/Logo'

/** The borrower-facing page shell shared by /start and /me: paper, a narrow column, the logo and the user chip. */
export function ApplyShell({ children, back = '/' }: { children: ReactNode; back?: string }) {
  return (
    <div className="grain min-h-dvh bg-paper">
      <div className="relative h-2.5 overflow-hidden bg-ink" aria-hidden>
        <div className="absolute inset-0" style={{ backgroundImage: 'var(--kawung)', backgroundSize: '14px 14px', filter: 'invert(1)', opacity: 0.18 }} />
      </div>
      <header className="mx-auto flex max-w-[620px] items-center justify-between gap-3 px-4 pt-5">
        <Link to={back} className="flex min-h-[44px] items-center gap-2 rounded-lg pr-2 text-ink" aria-label="Back">
          <ArrowLeft size={20} aria-hidden />
          <Logo size={28} />
        </Link>
        <UserChip />
      </header>
      <main className="mx-auto max-w-[620px] px-4 pb-16 pt-6">{children}</main>
    </div>
  )
}
