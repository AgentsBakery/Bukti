import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { CheckResult } from '../api/types'

export type StampTone = CheckResult | 'ink'

/** Rubber stamp. With `land`, it thumps onto the page. */
export function Stamp({
  tone = 'ink',
  children,
  rotate = -3,
  land = false,
  delay = 0,
  size = 12,
  className = '',
}: {
  tone?: StampTone
  children: ReactNode
  rotate?: number
  land?: boolean
  delay?: number
  size?: number
  className?: string
}) {
  const cls = `stamp ${tone === 'ink' ? '' : `stamp-${tone}`} ${className}`
  if (!land)
    return (
      <span className={cls} style={{ transform: `rotate(${rotate}deg)`, fontSize: size }}>
        {children}
      </span>
    )
  return (
    <motion.span
      className={cls}
      style={{ fontSize: size }}
      initial={{ scale: 1.9, opacity: 0, rotate: rotate - 9 }}
      animate={{ scale: 1, opacity: 1, rotate }}
      transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.7, delay }}
    >
      {children}
    </motion.span>
  )
}
