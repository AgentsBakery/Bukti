import { LogIn, LogOut } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import type { User } from '../api/types'
import { useAuth } from './AuthContext'

export function Avatar({ user, size = 30, ring = 'ring-paper' }: { user: User; size?: number; ring?: string }) {
  const [broken, setBroken] = useState(false)
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase()
  if (user.photo_url && !broken)
    return (
      <img
        src={user.photo_url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover ring-2 ${ring}`}
        style={{ width: size, height: size }}
      />
    )
  return (
    <span
      className={`font-display grid shrink-0 place-items-center rounded-full bg-turmeric font-bold text-ink ring-2 ${ring}`}
      style={{ width: size, height: size, fontSize: size * 0.48 }}
      aria-hidden
    >
      {initial}
    </span>
  )
}

/** Signed in: avatar + name with a small menu. Guest: a quiet "Sign in" link. */
export function UserChip({ tone = 'ink' }: { tone?: 'ink' | 'paper' }) {
  const { status, user, signOut } = useAuth()
  const loc = useLocation()
  const onInk = tone === 'paper'
  if (status === 'loading') return <span className="h-8 w-8" aria-hidden />
  if (!user)
    return (
      <Link
        to={`/login?next=${encodeURIComponent(loc.pathname)}`}
        className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-bold ${onInk ? 'text-paper/85 hover:bg-white/10 hover:text-paper' : 'link-ink'}`}
      >
        <LogIn size={16} aria-hidden /> Sign in
      </Link>
    )
  const first = user.name.split(/\s+/)[0]
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={`flex min-h-[40px] items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13.5px] font-bold transition-colors ${
          onInk ? 'bg-white/10 text-paper hover:bg-white/15' : 'bg-card text-ink shadow-sm ring-1 ring-soot/10 hover:ring-soot/25'
        }`}
        aria-label={`Signed in as ${user.name}`}
      >
        <Avatar user={user} size={28} ring={onInk ? 'ring-ink' : 'ring-card'} />
        <span className="max-w-[140px] truncate">{first}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="paper-card z-50 w-[260px] p-2 data-[state=open]:animate-[fade-up_.16s_ease]">
          <div className="flex items-center gap-3 px-2 pb-2.5 pt-1.5">
            <Avatar user={user} size={40} ring="ring-card" />
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-extrabold text-soot">{user.name}</p>
              <p className="truncate text-[12px] text-soot-2">{user.email}</p>
            </div>
          </div>
          <p className="font-hand border-t border-soot/10 px-2 pb-1 pt-2 text-[14px] text-soot-2">Your name goes on the decisions you sign.</p>
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="mt-1 flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-2 text-[14px] font-bold text-chili-ink outline-none data-[highlighted]:bg-chili/8"
          >
            <LogOut size={16} aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** Google's "G" mark for the sign-in button. */
export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
