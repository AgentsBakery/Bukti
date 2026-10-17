import type { Application } from '../api/types'
import { weekOfMonth } from './format'

/**
 * Affordability the way the policy agent states it: each week's installment against that
 * week's verified net cash (average weekly net × the shop's weekly cash pattern).
 * `amount` rescales the memo's own cash-flow-shaped schedule (officer slider).
 */
export function affordability(app: Application, amount?: number) {
  const memo = app.memo
  const m = app.metrics
  const weeklyNet = m ? (m.net_monthly_cashflow * 12) / 52 : 0
  const pattern = m?.weekly_pattern?.length ? m.weekly_pattern : [1, 1, 1, 1]
  const proposed = memo?.amount ?? 0
  const sched = memo?.schedule ?? []
  const target = amount ?? proposed
  let items: { amount: number; cash: number }[]
  if (sched.length && proposed > 0) {
    const f = target / proposed
    items = sched.map((s) => ({ amount: s.amount * f, cash: weeklyNet * (pattern[weekOfMonth(s.due_date)] ?? 1) }))
  } else {
    // no schedule to shape (e.g. a referral): assume 16 even weeks at a 6% flat fee
    const inst = (target * 1.06) / 16
    items = pattern.map((p) => ({ amount: inst, cash: weeklyNet * p }))
  }
  const total = items.reduce((s, x) => s + x.amount, 0)
  const avg = items.length ? total / items.length : 0
  const peak = items.reduce((mx, x) => Math.max(mx, x.amount), 0)
  const share = weeklyNet ? items.reduce((mx, x) => Math.max(mx, x.cash ? x.amount / x.cash : 0), 0) : 0
  return { weeklyNet, avg, peak, share, tenor: memo?.tenor_weeks || 16 }
}
