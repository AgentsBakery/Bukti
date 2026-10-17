import { Kawung } from './Kawung'

/** "Bukti" wordmark — the tittle of the i is a turmeric kawung flower. */
export function Logo({ size = 28, tone = 'ink', className = '' }: { size?: number; tone?: 'ink' | 'paper'; className?: string }) {
  const color = tone === 'ink' ? 'var(--color-ink)' : 'var(--color-paper)'
  return (
    <span
      className={`font-display inline-flex items-baseline select-none ${className}`}
      style={{ fontSize: size, fontWeight: 650, color, lineHeight: 1, letterSpacing: '-0.02em' }}
      aria-label="Bukti"
      role="img"
    >
      <span aria-hidden>Bukt</span>
      <span aria-hidden className="relative inline-block">
        ı
        <Kawung
          size={size * 0.42}
          seed={tone === 'ink' ? 'var(--color-paper)' : 'var(--color-ink)'}
          className="absolute"
          style={{ left: '50%', top: -size * 0.12, transform: 'translateX(-50%)' }}
        />
      </span>
    </span>
  )
}
