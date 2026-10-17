import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Application } from '../api/types'

/** Loads an application and optionally polls it. Skips re-renders when nothing changed. */
export function useApplication(appId: string | undefined, pollMs?: number) {
  const [app, setApp] = useState<Application | null>(null)
  const [error, setError] = useState<string | null>(null)
  const last = useRef('')

  const refresh = useCallback(async () => {
    if (!appId) return null
    try {
      const a = await api.getApplication(appId)
      const s = JSON.stringify(a)
      if (s !== last.current) {
        last.current = s
        setApp(a)
      }
      setError(null)
      return a
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [appId])

  const replace = useCallback((a: Application) => {
    last.current = JSON.stringify(a)
    setApp(a)
  }, [])

  useEffect(() => {
    last.current = ''
    setApp(null)
    void refresh()
    if (!pollMs) return
    const t = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(t)
  }, [refresh, pollMs])

  return { app, error, refresh, replace }
}

export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const last = useRef('')
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const d = await fn()
        const s = JSON.stringify(d)
        if (alive && s !== last.current) {
          last.current = s
          setData(d)
        }
      } catch {
        /* keep last good data */
      }
    }
    void tick()
    const t = window.setInterval(tick, ms)
    return () => {
      alive = false
      window.clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])
  return data
}
