import { useEffect, useLayoutEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/hooks'

type Levels = () => { agent: number; user: number }

const N = 72
const HARM = [
  { k: 2, a: 0.05, w: 0.7, p: 0.3 },
  { k: 3, a: 0.045, w: -1.1, p: 1.7 },
  { k: 5, a: 0.03, w: 1.6, p: 2.9 },
  { k: 7, a: 0.02, w: -2.3, p: 0.9 },
  { k: 11, a: 0.012, w: 3.1, p: 4.1 },
]

function blobPath(R: number, t: number, amp: number, seed = 0): string {
  const pts: [number, number][] = []
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2
    let r = 1
    for (const h of HARM) r += h.a * amp * Math.sin(h.k * th + h.p + seed + t * h.w)
    pts.push([Math.cos(th) * R * r, Math.sin(th) * R * r])
  }
  // closed Catmull-Rom → cubic Bézier
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % N]
    const p3 = pts[(i + 2) % N]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return d + ' Z'
}

/**
 * The interview's voice: an ink blot whose edge wobbles with the sound.
 * Agent speech swells the blot and warms its turmeric halo; the borrower's voice ripples a ring.
 */
export function InkOrb({ levels, state, size = 260 }: { levels?: Levels; state: 'idle' | 'connecting' | 'live' | 'done'; size?: number }) {
  const blob = useRef<SVGPathElement>(null)
  const sheen = useRef<SVGPathElement>(null)
  const halo = useRef<SVGCircleElement>(null)
  const ring = useRef<SVGCircleElement>(null)
  const ring2 = useRef<SVGCircleElement>(null)
  const drops = useRef<(SVGCircleElement | null)[]>([])
  const levelsRef = useRef(levels)
  const stateRef = useRef(state)
  useLayoutEffect(() => {
    levelsRef.current = levels
    stateRef.current = state
  }, [levels, state])

  useEffect(() => {
    const reduce = prefersReducedMotion()
    let raf = 0
    let a = 0
    let u = 0
    const t0 = performance.now()
    const frame = (now: number) => {
      const t = (now - t0) / 1000
      const lv = stateRef.current === 'live' ? levelsRef.current?.() ?? { agent: 0, user: 0 } : { agent: 0, user: 0 }
      a += (lv.agent - a) * (lv.agent > a ? 0.35 : 0.07)
      u += (lv.user - u) * (lv.user > u ? 0.4 : 0.08)
      const st = stateRef.current
      const idleAmp = st === 'connecting' ? 1.4 : st === 'done' ? 0.5 : 0.9
      const amp = reduce ? 0 : idleAmp + a * 4.2 + u * 1.8
      const R = 92 * (1 + (reduce ? 0 : 0.035 * Math.sin(t * 1.3)) + a * 0.12)
      const speed = st === 'connecting' ? 2.2 : 1 + a * 2.2
      blob.current?.setAttribute('d', blobPath(R, t * speed, amp))
      sheen.current?.setAttribute('d', blobPath(R * 0.56, t * speed * 1.2 + 2, amp * 0.8, 1.3))
      if (halo.current) {
        halo.current.setAttribute('r', String(R * (1.2 + a * 0.55)))
        halo.current.style.opacity = String(0.22 + a * 0.75)
      }
      if (ring.current && ring2.current) {
        const rr = R * (1.12 + u * 0.45)
        ring.current.setAttribute('r', String(rr))
        ring.current.style.opacity = String(Math.min(0.9, u * 1.6))
        ring2.current.setAttribute('r', String(rr + 14 + u * 22))
        ring2.current.style.opacity = String(Math.min(0.5, u * 0.9))
      }
      drops.current.forEach((d, i) => {
        if (!d) return
        const ang = t * (0.35 + i * 0.07) * (i % 2 ? -1 : 1) + i * 1.3
        const dist = R * (1.28 + 0.08 * Math.sin(t * 2 + i)) + a * 26
        d.setAttribute('cx', String(Math.cos(ang) * dist))
        d.setAttribute('cy', String(Math.sin(ang) * dist))
        d.setAttribute('r', String(Math.max(0, (2 + (i % 3) * 1.6) * (0.25 + a * 1.8))))
        d.style.opacity = String(Math.min(1, 0.15 + a * 1.6))
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg viewBox="-170 -170 340 340" width={size} height={size} aria-hidden className="overflow-visible">
      <defs>
        <radialGradient id="orb-halo">
          <stop offset="0%" stopColor="#E8A317" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#E8A317" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#E8A317" stopOpacity="0" />
        </radialGradient>
        <filter id="orb-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <radialGradient id="orb-sheen" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#7e8fd6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#3a4c96" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle ref={halo} r="120" fill="url(#orb-halo)" />
      <circle ref={ring2} r="130" fill="none" stroke="var(--color-turmeric)" strokeWidth="1.5" strokeDasharray="2 6" style={{ opacity: 0 }} />
      <circle ref={ring} r="110" fill="none" stroke="var(--color-turmeric-deep)" strokeWidth="2.5" style={{ opacity: 0 }} />
      {Array.from({ length: 6 }, (_, i) => (
        <circle key={i} ref={(el) => void (drops.current[i] = el)} r="0" fill="var(--color-ink)" />
      ))}
      <path ref={blob} fill="url(#ink-pool)" filter="url(#ink-bleed)" />
      <path ref={sheen} fill="url(#orb-sheen)" transform="translate(-16 -20)" filter="url(#orb-soft)" />
    </svg>
  )
}
