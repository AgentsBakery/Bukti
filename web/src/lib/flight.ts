// "The proof lifts off the page": a number peels off the photo, arcs up, and settles into
// its clean digital row, leaving a thin thread behind. Imperative WAAPI for smoothness —
// dozens of these run during an extraction and must not re-render React.
import { prefersReducedMotion } from './hooks'

export interface FlightOptions {
  layer: HTMLElement
  from: Element
  to: Element
  text: string
  tone?: 'in' | 'out' | 'rail'
  duration?: number
  onLand?: () => void
  thread?: boolean
}

function local(layer: HTMLElement, r: DOMRect) {
  const L = layer.getBoundingClientRect()
  const scale = L.width / (layer.offsetWidth || L.width || 1) || 1
  return { x: (r.left - L.left) / scale, y: (r.top - L.top) / scale, w: r.width / scale, h: r.height / scale, scale }
}

export function flyNumber(o: FlightOptions): void {
  const { layer, from, to, text } = o
  if (prefersReducedMotion() || !layer.isConnected || !from.isConnected || !to.isConnected) {
    o.onLand?.()
    return
  }
  const a = local(layer, from.getBoundingClientRect())
  const b = local(layer, to.getBoundingClientRect())
  if (!a.w || !b.w) {
    o.onLand?.()
    return
  }
  const duration = o.duration ?? 760
  const cs = getComputedStyle(to)

  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.textContent = text
  const color = o.tone === 'out' ? 'var(--color-chili-ink)' : o.tone === 'rail' ? 'var(--color-leaf-ink)' : 'var(--color-ink)'
  Object.assign(el.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: '700',
    lineHeight: '1',
    letterSpacing: cs.letterSpacing,
    color,
    padding: '5px 7px 4px',
    margin: '0',
    borderRadius: '6px',
    background: 'var(--color-card)',
    border: '1px solid rgb(43 38 32 / 0.14)',
    whiteSpace: 'nowrap',
    willChange: 'transform, opacity',
    fontVariantNumeric: 'tabular-nums',
    zIndex: '2',
  } satisfies Partial<CSSStyleDeclaration>)
  layer.appendChild(el)
  const ew = el.offsetWidth
  const eh = el.offsetHeight
  // final: right-aligned with the target's text, vertically centred on it
  const fx = b.x + b.w - ew + 7
  const fy = b.y + b.h / 2 - eh / 2
  el.style.left = `${fx}px`
  el.style.top = `${fy}px`
  // start: centred on the handwritten amount, scaled to its height
  const sx = a.x + a.w / 2 - (fx + ew / 2)
  const sy = a.y + a.h / 2 - (fy + eh / 2)
  const s0 = Math.max(0.35, Math.min(1.1, (a.h * 0.95) / eh))
  const lift = Math.min(60, 24 + Math.abs(sy) * 0.12)
  const anim = el.animate(
    [
      { offset: 0, transform: `translate(${sx}px, ${sy}px) scale(${s0}) rotate(-1deg)`, opacity: 0, boxShadow: '0 0 0 0 rgb(30 42 90 / 0)', backgroundColor: 'rgb(251 247 238 / 0)', borderColor: 'rgb(43 38 32 / 0)' },
      { offset: 0.14, transform: `translate(${sx}px, ${sy - 6}px) scale(${s0 * 1.12}) rotate(-2deg)`, opacity: 1, boxShadow: '0 4px 10px -4px rgb(30 42 90 / 0.35)', backgroundColor: 'rgb(251 247 238 / 0.96)', borderColor: 'rgb(43 38 32 / 0.14)', easing: 'cubic-bezier(.3,.6,.3,1)' },
      { offset: 0.5, transform: `translate(${sx * 0.55}px, ${sy * 0.55 - lift}px) scale(1.24) rotate(1.5deg)`, opacity: 1, boxShadow: '0 18px 28px -10px rgb(30 42 90 / 0.45)', backgroundColor: 'rgb(251 247 238 / 1)', borderColor: 'rgb(43 38 32 / 0.14)', easing: 'cubic-bezier(.45,0,.2,1)' },
      { offset: 0.9, transform: 'translate(0px, 0px) scale(1.02) rotate(0deg)', opacity: 1, boxShadow: '0 2px 4px -2px rgb(30 42 90 / 0.25)', backgroundColor: 'rgb(251 247 238 / 0.9)', borderColor: 'rgb(43 38 32 / 0.1)' },
      { offset: 1, transform: 'translate(0px, 0px) scale(1)', opacity: 1, boxShadow: '0 0 0 0 rgb(30 42 90 / 0)', backgroundColor: 'rgb(251 247 238 / 0)', borderColor: 'rgb(43 38 32 / 0)' },
    ],
    { duration, fill: 'forwards' },
  )

  if (o.thread !== false) {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: '1' })
    const path = document.createElementNS(ns, 'path')
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    const x2 = b.x + b.w - ew / 2
    const y2 = b.y
    const midY = (y1 + y2) / 2
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY - 10}, ${x2} ${y2}`)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', o.tone === 'rail' ? 'var(--color-leaf)' : 'var(--color-turmeric-deep)')
    path.setAttribute('stroke-width', '1')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-dasharray', '2 3')
    svg.appendChild(path)
    layer.appendChild(svg)
    const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1) * 1.25)
    path.style.strokeDasharray = `${len}`
    path.animate([{ strokeDashoffset: `${len}`, opacity: 0.75 }, { strokeDashoffset: '0', opacity: 0.55 }], { duration: duration * 0.85, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards' })
    window.setTimeout(() => {
      const fade = svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, fill: 'forwards' })
      fade.onfinish = () => svg.remove()
    }, duration + 60)
  }

  anim.onfinish = () => {
    o.onLand?.()
    const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
    out.onfinish = () => el.remove()
  }
}

/** Scroll `child` to the middle of scroll container `box` without touching ancestor scrolling. */
export function centerIn(box: HTMLElement, child: HTMLElement, smooth = false) {
  const boxRect = box.getBoundingClientRect()
  const r = child.getBoundingClientRect()
  const scale = boxRect.height / (box.clientHeight || boxRect.height || 1) || 1
  const delta = (r.top - boxRect.top) / scale - box.clientHeight / 2 + r.height / scale / 2
  box.scrollTo({ top: box.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' })
}

/** Bring `el` into view inside its nearest `[data-scroll]` container only (never the page). */
export function revealInScroller(el: HTMLElement) {
  const box = el.closest<HTMLElement>('[data-scroll]')
  if (!box) return
  const b = box.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return
  const delta = r.top < b.top ? r.top - b.top - 12 : r.bottom - b.bottom + 12
  box.scrollTo({ top: box.scrollTop + delta, behavior: 'smooth' })
}
