// Optional Google sign-in. Never blocks anything: guests get the full demo.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { User } from '../api/types'

type Status = 'loading' | 'guest' | 'signed-in'

interface AuthValue {
  status: Status
  /** Google sign-in is configured on the server (or mock auth is on). */
  enabled: boolean
  user: User | null
  error: string | null
  signIn: () => Promise<boolean>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

const FRIENDLY: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/cancelled-popup-request': 'Another sign-in window is already open.',
  'auth/unauthorized-domain': 'This web address is not yet authorised for Google sign-in.',
  'auth/operation-not-allowed': 'Google sign-in is not switched on for this project yet.',
  'auth/network-request-failed': 'No connection to Google. Check the network and try again.',
}

function describe(err: unknown): string {
  const code = (err as { code?: string })?.code
  if (code && FRIENDLY[code]) return `${FRIENDLY[code]} (${code})`
  if (code) return `Sign-in failed (${code}).`
  return err instanceof Error ? err.message : 'Sign-in failed.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [enabled, setEnabled] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fb = useRef<{ mod: typeof import('./firebase'); auth: import('./firebase').Auth } | null>(null)
  const explicit = useRef(false)

  useEffect(() => {
    let unsub: (() => void) | undefined
    let alive = true
    void (async () => {
      const cfg = await api.authConfig().catch(() => ({ enabled: false as const }))
      if (!alive) return
      setEnabled(cfg.enabled)
      if (!cfg.enabled) return setStatus('guest')
      if (api.mode === 'mock' || !('firebase' in cfg) || !cfg.firebase) {
        const u = await api.me().catch(() => null)
        setUser(u)
        return setStatus(u ? 'signed-in' : 'guest')
      }
      try {
        const mod = await import('./firebase')
        const auth = mod.initAuth(cfg.firebase)
        fb.current = { mod, auth }
        unsub = mod.onUser(auth, async (fu) => {
          if (!fu) {
            api.setTokenProvider(null)
            setUser(null)
            setStatus('guest')
            return
          }
          api.setTokenProvider(() => fu.getIdToken())
          const fallback: User = {
            uid: fu.uid,
            email: fu.email ?? '',
            name: fu.displayName ?? fu.email ?? 'You',
            photo_url: fu.photoURL,
            role: 'borrower',
            created_at: fu.metadata.creationTime ?? new Date().toISOString(),
            last_login_at: new Date().toISOString(),
            login_count: 1,
          }
          try {
            // a fresh popup sign-in records a login; a restored session just looks the user up
            const u = explicit.current ? await api.createSession() : ((await api.me()) ?? (await api.createSession()))
            setUser(u)
          } catch {
            setUser(fallback)
          }
          explicit.current = false
          setStatus('signed-in')
        })
      } catch (e) {
        setError(describe(e))
        setStatus('guest')
      }
    })()
    return () => {
      alive = false
      unsub?.()
    }
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    try {
      if (fb.current) {
        explicit.current = true
        await fb.current.mod.signInGoogle(fb.current.auth)
        return true
      }
      if (enabled) {
        // mock mode: no Firebase, the mock API plays the server's part
        const u = await api.createSession()
        setUser(u)
        setStatus('signed-in')
        return true
      }
      setError('Google sign-in is being set up.')
      return false
    } catch (e) {
      explicit.current = false
      // Surface the exact reason in the console for whoever is debugging COOP/CSP/popups.
      console.warn('[bukti] Google sign-in failed', e)
      setError(describe(e))
      return false
    }
  }, [enabled])

  const signOut = useCallback(async () => {
    if (fb.current) await fb.current.mod.signOutGoogle(fb.current.auth)
    api.setTokenProvider(null)
    setUser(null)
    setStatus('guest')
  }, [])

  const value = useMemo(() => ({ status, enabled, user, error, signIn, signOut }), [status, enabled, user, error, signIn, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
