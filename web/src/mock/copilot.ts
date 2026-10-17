// Scripted Officer Copilot for mock mode. Every number is computed from the case itself, so
// the answers stay true for any pack (genuine, inflated or fabricated).
import type { Unsubscribe } from '../api/client'
import type { Application, CopilotEvent } from '../api/types'
import { dayMatch } from '../borrower/LedgerBook'
import { fmtDate, money, moneyShort, weekOfMonth } from '../lib/format'
import { analyse, POLICY } from './engine'
import { MODELS, record, recordModel, recordTool } from './events'
import { randomFloat, randomId } from '../lib/random'

type Step = { tool: string; args: Record<string, unknown>; detail: string }
interface Plan {
  steps: Step[]
  highlight?: { refs: string[]; note: string }
  text: string
  refs: string[]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pctOf = (a: number, b: number) => Math.round((a / Math.max(1, b)) * 100)

function dayList(dates: string[]): string {
  if (!dates.length) return ''
  const days = dates.map((d) => Number(d.slice(8, 10)))
  const month = fmtDate(dates[0], 'en', { month: 'short' })
  return days.length === 1 ? `${days[0]} ${month}` : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]} ${month}`
}

function plan(app: Application, question: string): Plan {
  const q = question.toLowerCase()
  const m = app.market
  const P = POLICY[m]
  const rail = P.rail
  const a = analyse(app)
  const stmtEv = app.evidence.find((e) => e.type === 'statement')?.id
  const salesBy = (wk: number) => a.sales.filter((e) => weekOfMonth(e.date) === wk)
  const stmtBy = (wk: number) => app.statement.filter((d) => weekOfMonth(d.date) === wk)
  const checks = new Map(app.checks.map((c) => [c.id, c]))
  const fails = app.checks.filter((c) => c.result === 'fail')
  const fact = (field: string) => app.facts.find((f) => f.field === field)

  const intent = /week|minggu|lower|dip|quiet|slow|sepi/.test(q)
    ? 'week2'
    : /match|qris|upi|statement|mismatch|don.?t|line up/.test(q)
      ? 'mismatch'
      : /genuine|fake|real|fabricat|honest|trust|asli|true/.test(q)
        ? 'genuine'
        : /ask|before approv|question|visit/.test(q)
          ? 'ask'
          : /afford|installment|repay|schedule|how much|amount/.test(q)
            ? 'afford'
            : 'summary'

  if (intent === 'week2') {
    const w1 = salesBy(0)
    const w2 = salesBy(1)
    const d1 = new Set(w1.map((e) => e.date)).size || 1
    const d2 = new Set(w2.map((e) => e.date)).size || 1
    const l1 = w1.reduce((s, e) => s + e.amount_in, 0) / d1
    const l2 = w2.reduce((s, e) => s + e.amount_in, 0) / d2
    const s1 = avg(stmtBy(0).map((d) => d.total))
    const s2 = avg(stmtBy(1).map((d) => d.total))
    const why = fact('slow_period_reason')
    const dates = w2.map((e) => e.date).sort((a, b) => a.localeCompare(b))
    const span = dates.length ? `${Number(dates[0].slice(8))}–${Number(dates[dates.length - 1].slice(8))} ${fmtDate(dates[0], 'en', { month: 'short' })}` : 'week 2'
    const real = Math.abs(pctOf(l2, l1) - pctOf(s2, s1)) < 20
    return {
      steps: [
        { tool: 'get_metrics', args: {}, detail: 'weekly cash pattern, digital share' },
        { tool: 'get_entries', args: { date_from: dates[0], date_to: dates[dates.length - 1] }, detail: `${w2.length} lines in ${span}` },
        { tool: 'get_statement', args: { date_from: dates[0], date_to: dates[dates.length - 1] }, detail: `${stmtBy(1).length} ${rail} days` },
      ],
      highlight: { refs: w2.map((e) => e.id), note: `Week-2 sales lines, ${span}` },
      text:
        `Week 2 (${span}) is the quiet week. The notebook averages ${moneyShort(l2, m, 'en')} a day against ${moneyShort(l1, m, 'en')} in week 1 — ${100 - pctOf(l2, l1)}% lower. ` +
        `${rail} falls by ${100 - pctOf(s2, s1)}% over the same days (${moneyShort(s2, m, 'en')} vs ${moneyShort(s1, m, 'en')} a day), ` +
        (real ? 'so the dip is real trading, not missing records. ' : 'which does not match the notebook — treat the dip with care. ') +
        (why ? `In the interview the owner explained it herself: “${why.quote}” ` : '') +
        'The repayment schedule already asks for its smallest installments in that week.',
      refs: [...w2.slice(0, 6).map((e) => e.id), 'chk_rhythm', ...(why ? [why.id] : [])].filter((r) => !r.startsWith('chk_') || checks.has(r)),
    }
  }

  if (intent === 'mismatch') {
    const sales = new Map<string, number>()
    for (const e of a.sales) sales.set(e.date, (sales.get(e.date) ?? 0) + e.amount_in)
    const none: string[] = []
    const gap: string[] = []
    for (const d of app.statement) {
      const r = dayMatch(sales.get(d.date) ?? 0, d)
      if (r === 'none') none.push(d.date)
      if (r === 'gap') gap.push(d.date)
    }
    const bad = [...none, ...gap]
    const badEntries = a.sales.filter((e) => bad.includes(e.date)).map((e) => e.id)
    const steps: Step[] = [
      { tool: 'get_statement', args: {}, detail: `${app.statement.length} ${rail} days` },
      { tool: 'get_entries', args: { kind: 'sales' }, detail: `${a.sales.length} sales lines` },
    ]
    if (!bad.length) {
      const shares = app.statement.map((d) => d.total / Math.max(1, sales.get(d.date) ?? 1)).filter((x) => x > 0)
      return {
        steps,
        highlight: stmtEv ? { refs: [stmtEv], note: `${rail} statement — every day lines up` } : undefined,
        text: `All ${app.statement.length} days line up. Every day with notebook sales also has ${rail} payments, and ${rail} covers between ${Math.round(Math.min(...shares) * 100)}% and ${Math.round(Math.max(...shares) * 100)}% of each day's notebook total — the normal range for a shop that also takes cash.`,
        refs: ['chk_share', 'chk_ghost'].filter((r) => checks.has(r)),
      }
    }
    const examples = gap.slice(0, 2).map((d) => {
      const st = app.statement.find((x) => x.date === d)!
      return `${Number(d.slice(8))} ${fmtDate(d, 'en', { month: 'short' })}: notebook ${moneyShort(sales.get(d) ?? 0, m, 'en')}, ${rail} ${moneyShort(st.total, m, 'en')}`
    })
    return {
      steps,
      highlight: { refs: [...badEntries, ...(stmtEv ? [stmtEv] : [])], note: `${bad.length} days that don’t line up` },
      text:
        `${bad.length} of ${app.statement.length} days don't line up. ` +
        (none.length ? `On ${dayList(none)} the notebook records sales but ${rail} shows no payments at all — on those days the shop looks closed. ` : '') +
        (gap.length ? `On ${gap.length} more days ${rail} covers under 15% of the notebook figure (${examples.join('; ')}). ` : '') +
        `Similar shops sit at ${Math.round(P.band[0] * 100)}–${Math.round(P.band[1] * 100)}%.`,
      refs: ['chk_ghost', 'chk_share', ...badEntries.slice(0, 6)].filter((r) => !r.startsWith('chk_') || checks.has(r)),
    }
  }

  if (intent === 'genuine') {
    const steps: Step[] = [
      { tool: 'get_checks', args: {}, detail: `${app.checks.length} checks` },
      { tool: 'get_entries', args: { kind: 'sales' }, detail: `${a.sales.length} sales lines` },
    ]
    if (!fails.length) {
      return {
        steps,
        highlight: { refs: a.sales.slice(0, 8).map((e) => e.id), note: 'Uneven, natural amounts' },
        text: `Yes, it reads as genuine. All ${app.checks.length} checks pass: only ${Math.round(a.roundShare * 100)}% of daily sales are round numbers, busy and quiet days move with ${rail} (r = ${a.corr.toFixed(2)}), and no sales fall on days ${rail} shows the shop closed. Nothing suggests it was written in one sitting.`,
        refs: ['chk_round', 'chk_rhythm', 'chk_ghost', 'chk_regular'].filter((r) => checks.has(r)),
      }
    }
    const strongest = checks.get('chk_ghost')?.result === 'fail' ? `${a.closedDates.length} sales on days ${rail} shows no activity` : fails[0].summary.toLowerCase()
    return {
      steps,
      highlight: { refs: fails.map((c) => c.id), note: `${fails.length} failing checks` },
      text:
        `Probably not as written. ${fails.length} checks fail: ${fails.map((c) => c.name.toLowerCase()).join(', ')}. ` +
        `The strongest signal is ${strongest}, and only ${a.distinct} different daily totals across ${a.salesByDate.size} days. ` +
        `The shop itself looks real — ${rail} shows about ${moneyShort(a.stmtTotal / Math.max(1, a.days), m, 'en')} a day — so a field visit is the fair next step, not a rejection.`,
      refs: fails.map((c) => c.id),
    }
  }

  if (intent === 'ask') {
    const steps: Step[] = [
      { tool: 'get_memo', args: {}, detail: 'reasons, risks, schedule' },
      { tool: 'get_checks', args: { result: 'warn,fail' }, detail: `${app.checks.filter((c) => c.result !== 'pass').length} to watch` },
      { tool: 'get_facts', args: {}, detail: `${app.facts.length} interview facts` },
    ]
    if (fails.length) {
      return {
        steps,
        highlight: { refs: a.sales.filter((e) => a.closedDates.includes(e.date)).map((e) => e.id), note: 'Sales on idle days' },
        text:
          (a.closedDates.length ? `1. “Was the shop open on ${dayList(a.closedDates)}?” — the notebook has sales, ${rail} has none.\n` : '1. “Which days is the shop usually closed?”\n') +
          `2. “Can you show me a week of ${rail} history on your phone?” — it is the strongest proof she has.\n` +
          '3. “Who writes the notebook, and when?” — the entries look written in one sitting.',
        refs: fails.map((c) => c.id),
      }
    }
    const purpose = fact('loan_purpose')
    const wk2 = salesBy(1).map((e) => e.id)
    return {
      steps,
      highlight: { refs: wk2, note: 'The quiet week' },
      text:
        '1. “How do you cover restocking in the quiet week?” — cash is tightest around the middle of the month, even though installments are smallest then.\n' +
        `2. “Do you write down every restock?” — only ${a.purchases.length} purchase lines in ${a.days} days, so net cash may be overstated.\n` +
        (purpose ? `3. “Show me where the ${purpose.value.toLowerCase()} will go.” — confirms the loan purpose she gave in the interview.` : '3. “What will the loan be used for?” — the interview was skipped, so the purpose is unconfirmed.'),
      refs: [...wk2.slice(0, 3), ...(purpose ? [purpose.id] : []), ...['chk_afford'].filter((r) => checks.has(r))],
    }
  }

  if (intent === 'afford') {
    const memo = app.memo
    const peak = memo?.schedule.length ? Math.max(...memo.schedule.map((s) => s.amount)) : 0
    return {
      steps: [
        { tool: 'get_metrics', args: {}, detail: 'net cash, weekly pattern' },
        { tool: 'get_memo', args: { field: 'schedule' }, detail: `${memo?.schedule.length ?? 0} installments` },
      ],
      text: memo?.amount
        ? `The memo proposes ${money(memo.amount, m)} over ${memo.tenor_weeks} weeks. The largest installment is ${money(peak, m)}, inside the 30% of that week's verified net cash allowed by policy. Verified net cash is about ${money(Math.round((app.metrics?.net_monthly_cashflow ?? 0)), m)} a month.`
        : `No amount is proposed: the notebook can't be relied on. Size any loan on ${rail} alone after a field visit.`,
      refs: ['chk_afford', 'chk_share'].filter((r) => checks.has(r)),
    }
  }

  return {
    steps: [{ tool: 'get_memo', args: {}, detail: 'headline and reasons' }],
    text: app.memo
      ? `${app.memo.headline} Ask me about the quiet week, the days that don't match ${rail}, or what to check with the borrower.`
      : `The memo isn't ready yet. I can already look at the notebook lines and the ${rail} statement — try asking which days don't match.`,
    refs: app.memo?.reasons.flatMap((r) => r.refs).slice(0, 4) ?? [],
  }
}

export function mockCopilot(app: Application, question: string, sessionId: string | undefined, onEvent: (e: CopilotEvent) => void): Unsubscribe {
  let alive = true
  const timers: number[] = []
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), ms))
  const p = plan(app, question)
  const sid = sessionId ?? `cs_${randomId(8)}`
  record('copilot.question', app.id, { agent: 'copilot', detail: question.slice(0, 140) })

  let t = 250
  at(t, () => onEvent({ type: 'session', session_id: sid }))
  for (const s of p.steps) {
    t += 650 + randomFloat() * 350
    at(t, () => {
      onEvent({ type: 'tool', name: s.tool, args: s.args })
      recordTool(app.id, 'copilot', s.tool, s.detail)
    })
  }
  if (p.highlight) {
    t += 500
    const h = p.highlight
    at(t, () => onEvent({ type: 'highlight', refs: h.refs, note: h.note }))
  }
  t += 700
  const words = p.text.split(/(\s+)/)
  let acc = 0
  for (let i = 0; i < words.length; i += 2) {
    const chunk = words.slice(i, i + 2).join('')
    acc += 26
    at(t + acc, () => onEvent({ type: 'answer_delta', text: chunk }))
  }
  t += acc + 250
  at(t, () => {
    onEvent({ type: 'answer', text: p.text, refs: p.refs })
    recordModel(app.id, 'copilot', MODELS.extract, `Answered: “${question.slice(0, 60)}”`, { latency: [2200, 4200], tin: [6800, 9400], tout: [180, 420] })
  })
  at(t + 120, () => onEvent({ type: 'done' }))
  return () => {
    alive = false
    timers.forEach((x) => window.clearTimeout(x))
  }
}
