import { useEffect, useState, type CSSProperties } from 'react'
import type { BBox } from '../api/types'

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Absolute-position style for a Gemini bbox ([ymin,xmin,ymax,xmax] in 0–1000) over its image. */
export function bboxStyle(b: BBox, pad = 0): CSSProperties {
  const [y0, x0, y1, x1] = b
  return {
    position: 'absolute',
    top: `${(y0 - pad) / 10}%`,
    left: `${(x0 - pad) / 10}%`,
    height: `${(y1 - y0 + pad * 2) / 10}%`,
    width: `${(x1 - x0 + pad * 2) / 10}%`,
  }
}

export function bboxUnion(boxes: BBox[]): BBox | null {
  if (!boxes.length) return null
  return boxes.reduce<BBox>(
    (u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])],
    [1000, 1000, 0, 0],
  )
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

export function useTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => {
      document.title = prev
    }
  }, [title])
}
