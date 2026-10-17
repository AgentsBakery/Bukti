import type { CSSProperties } from 'react'

/** A single kawung flower — four petals around a seed. Used as mark, bullet and loader. */
export function Kawung({
  size = 24,
  color = 'var(--color-turmeric)',
  seed = 'var(--color-paper)',
  stroke,
  spin = false,
  className = '',
  style,
  title,
}: {
  size?: number
  color?: string
  seed?: string
  stroke?: string
  spin?: boolean
  className?: string
  style?: CSSProperties
  title?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-24 -24 48 48"
      className={`${spin ? 'animate-spin-slow' : ''} ${className}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g fill={stroke ? 'none' : color} stroke={stroke} strokeWidth={stroke ? 2 : 0}>
        {[45, 135, 225, 315].map((r) => (
          <ellipse key={r} rx="6.4" ry="11.6" transform={`rotate(${r}) translate(0 -11.2)`} />
        ))}
      </g>
      <circle r="3" fill={seed} />
    </svg>
  )
}

/** Loader: a kawung that slowly turns while its petals breathe. */
export function KawungLoader({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="relative" style={{ width: size, height: size }}>
        <Kawung size={size} stroke="var(--color-ink)" spin className="absolute inset-0 opacity-30" />
        <Kawung size={size * 0.62} spin className="absolute" style={{ left: size * 0.19, top: size * 0.19, animationDirection: 'reverse' }} />
      </div>
      {label ? <p className="text-[15px] text-soot-2">{label}</p> : null}
    </div>
  )
}
