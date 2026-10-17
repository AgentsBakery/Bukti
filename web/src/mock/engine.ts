// Mock assessment engine. Computes every check, metric and memo from the pack's actual
// numbers (never from the pack's label), so genuine packs pass and fakes get caught for
// the same reasons the real agents would catch them.
import type { Application, Check, Entry, Fact, Lang, Memo, MemoDecision, Metrics, ScheduleItem } from '../api/types'
import { figure, money, moneyShort, parseISODate, pct, shortName, weekOfMonth } from '../lib/format'
import { businessName } from '../lib/text'

export const POLICY = {
  ID: { band: [0.3, 0.46] as [number, number], peerDaily: 470_000, step: 100_000, mult: 0.85, round: 1000, rail: 'QRIS', roundStep: 50_000, shop: 'warung', country: 'Indonesia' },
  IN: { band: [0.48, 0.66] as [number, number], peerDaily: 5_100, step: 500, mult: 0.75, round: 10, rail: 'UPI', roundStep: 500, shop: 'kirana', country: 'Tamil Nadu' },
}
const FEE = 0.06 // flat 1.5%/month over ~4 months
const TENOR = 16
const MAX_SHARE = 0.3

export interface Analysis {
  sales: Entry[]
  purchases: Entry[]
  salesByDate: Map<string, number>
  ledgerSales: number
  purchaseTotal: number
  stmtTotal: number
  share: number
  corr: number
  closedDates: string[]
  roundShare: number
  distinct: number
  days: number
  weekly: number[]
  avgDaily: number
  verified28: number
  netMonthly: number
  weeklyNet: number
  peerRatio: number
  claimedDaily: number | null
}

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 3) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
}

function factNumber(f: Fact | undefined): number | null {
  if (!f) return null
  const digits = f.value.replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

export function analyse(app: Application): Analysis {
  const P = POLICY[app.market]
  const sales = app.entries.filter((e) => e.amount_in > 0)
  const purchases = app.entries.filter((e) => e.amount_out > 0)
  const salesByDate = new Map<string, number>()
  for (const e of sales) salesByDate.set(e.date, (salesByDate.get(e.date) ?? 0) + e.amount_in)
  const ledgerSales = sales.reduce((a, e) => a + e.amount_in, 0)
  const purchaseTotal = purchases.reduce((a, e) => a + e.amount_out, 0)
  const stmtTotal = app.statement.reduce((a, d) => a + d.total, 0)
  const days = Math.max(1, app.statement.length || salesByDate.size)
  const xs = app.statement.map((d) => salesByDate.get(d.date) ?? 0)
  const ys = app.statement.map((d) => d.total)
  const closedDates = app.statement.filter((d) => d.transactions === 0 && (salesByDate.get(d.date) ?? 0) > 0).map((d) => d.date)
  const dailyValues = [...salesByDate.values()]
  const roundShare = dailyValues.length ? dailyValues.filter((v) => v % P.roundStep === 0).length / dailyValues.length : 0
  const distinct = new Set(dailyValues).size
  const wk = [0, 0, 0, 0]
  for (const d of app.statement) wk[weekOfMonth(d.date)] += d.total
  const wMean = wk.reduce((a, b) => a + b, 0) / 4 || 1
  const weekly = wk.map((w) => Math.round((w / wMean) * 100) / 100)
  const share = ledgerSales ? stmtTotal / ledgerSales : 0
  const peerMid = (P.band[0] + P.band[1]) / 2
  const verified28 = Math.min(ledgerSales, stmtTotal / peerMid)
  const netMonthly = Math.max(0, (verified28 - purchaseTotal * (ledgerSales ? verified28 / ledgerSales : 0)) * (30 / days))
  const avgDaily = ledgerSales / days
  return {
    sales, purchases, salesByDate, ledgerSales, purchaseTotal, stmtTotal, share,
    corr: correlation(xs, ys), closedDates, roundShare, distinct, days, weekly, avgDaily,
    verified28, netMonthly, weeklyNet: (netMonthly * 12) / 52, peerRatio: avgDaily / P.peerDaily,
    claimedDaily: factNumber(app.facts.find((f) => f.field === 'daily_sales')),
  }
}

export function computeMetrics(app: Application, a: Analysis): Metrics {
  const P = POLICY[app.market]
  return {
    ledger_sales_total: a.ledgerSales,
    ledger_purchases_total: a.purchaseTotal,
    statement_total: a.stmtTotal,
    digital_share: Math.round(a.share * 1000) / 1000,
    peer_share_band: P.band,
    peer_median_daily_sales: P.peerDaily,
    verified_monthly_sales: Math.round((a.verified28 * 30) / a.days),
    net_monthly_cashflow: Math.round(a.netMonthly),
    weekly_pattern: a.weekly,
    daily: app.statement.map((d) => ({ date: d.date, ledger: a.salesByDate.get(d.date) ?? 0, statement: d.total })),
  }
}

const ev = (app: Application, type: 'ledger' | 'statement') => app.evidence.filter((e) => e.type === type).map((e) => e.id)

export function computeChecks(app: Application, a: Analysis): Check[] {
  const P = POLICY[app.market]
  const m = app.market
  const stmt = ev(app, 'statement')
  const ledger = ev(app, 'ledger')
  const checks: Check[] = []
  const add = (id: string, c: Omit<Check, 'id'>) => checks.push({ ...c, id })
  const band = `${pct(P.band[0])}–${pct(P.band[1])}`

  // Reconciler ---------------------------------------------------------------
  {
    const s = a.share
    const result = s >= P.band[0] && s <= P.band[1] * 1.3 ? 'pass' : s >= P.band[0] * 0.75 ? 'warn' : 'fail'
    const top = [...a.sales].sort((x, y) => y.amount_in - x.amount_in).slice(0, 4).map((e) => e.id)
    add('chk_share', {
      agent: 'reconciler',
      name: 'Notebook vs payment records',
      result,
      summary:
        result === 'pass'
          ? `${P.rail} confirms ${pct(s)} of notebook sales — normal for a ${P.shop} that also takes cash.`
          : result === 'warn'
            ? `${P.rail} covers only ${pct(s)} of notebook sales, a little under the usual ${band}.`
            : `Notebook sales are ${((P.band[0] + P.band[1]) / 2 / Math.max(s, 0.01)).toFixed(1)}× what ${P.rail} payments can support.`,
      detail: `Notebook sales ${money(a.ledgerSales, m)} · ${P.rail} received ${money(a.stmtTotal, m)} · digital share ${pct(s, 1)} · peer band ${band}`,
      evidence_refs: result === 'pass' ? [...stmt, ...ledger] : [...stmt, ...top],
    })
  }
  {
    const r = a.corr
    const result = r >= 0.6 ? 'pass' : r >= 0.3 ? 'warn' : 'fail'
    const wk2 = a.sales.filter((e) => weekOfMonth(e.date) === 1).slice(0, 5).map((e) => e.id)
    add('chk_rhythm', {
      agent: 'reconciler',
      name: 'Daily rhythm agreement',
      result,
      summary:
        result === 'pass'
          ? `Busy and quiet days in the notebook show up in ${P.rail} too (r = ${r.toFixed(2)}).`
          : result === 'warn'
            ? `Notebook and ${P.rail} only loosely move together (r = ${r.toFixed(2)}).`
            : `Notebook and ${P.rail} do not move together at all (r = ${r.toFixed(2)}).`,
      detail: `Pearson correlation of daily notebook sales vs daily ${P.rail} totals over ${a.days} days. Genuine shops in the pilot score 0.7–0.9.`,
      evidence_refs: [...stmt, ...wk2],
    })
  }
  if (a.claimedDaily) {
    const ratio = a.claimedDaily / Math.max(1, a.avgDaily)
    const result = ratio >= 0.7 && ratio <= 1.4 ? 'pass' : ratio <= 1.9 ? 'warn' : 'fail'
    const f = app.facts.find((x) => x.field === 'daily_sales')!
    add('chk_interview', {
      agent: 'reconciler',
      name: 'Interview vs ledger',
      result,
      summary:
        result === 'pass'
          ? `Said "${f.value}" a day; the notebook averages ${moneyShort(a.avgDaily, m, 'en')} — consistent.`
          : `Said "${f.value}" a day, but the notebook averages ${moneyShort(a.avgDaily, m, 'en')} and ${P.rail} implies far less.`,
      detail: `Claimed daily sales ${money(a.claimedDaily, m)} vs notebook average ${money(Math.round(a.avgDaily), m)} (${ratio.toFixed(2)}×).`,
      evidence_refs: [f.id, ...ledger],
    })
  }
  const neverClosed = app.facts.find((f) => f.field === 'days_open')
  if (neverClosed && a.closedDates.length) {
    add('chk_interview_days', {
      agent: 'reconciler',
      name: 'Interview vs statement',
      result: 'fail',
      summary: `Said the shop never closes; ${P.rail} shows no payments at all on ${a.closedDates.length} days.`,
      detail: `Quote: “${neverClosed.quote}”. Zero-transaction days: ${a.closedDates.map((d) => parseISODate(d).getDate()).join(', ')} ${parseISODate(a.closedDates[0]).toLocaleString('en-GB', { month: 'short' })}.`,
      evidence_refs: [neverClosed.id, ...stmt],
    })
  }

  // Integrity ----------------------------------------------------------------
  {
    const n = a.closedDates.length
    const result = n === 0 ? 'pass' : n === 1 ? 'warn' : 'fail'
    const refs = a.sales.filter((e) => a.closedDates.includes(e.date)).map((e) => e.id)
    add('chk_ghost', {
      agent: 'reconciler',
      name: 'Sales on idle days',
      result,
      summary: n === 0 ? `No sales written on days ${P.rail} shows the shop closed.` : `Sales written on ${n} day${n > 1 ? 's' : ''} when ${P.rail} shows no payments at all.`,
      detail: n === 0 ? `${a.days} of ${a.days} days have ${P.rail} activity.` : `Days with 0 ${P.rail} transactions but notebook sales: ${a.closedDates.join(', ')}.`,
      evidence_refs: n ? [...refs, ...stmt] : [...stmt],
    })
  }
  {
    const r = a.roundShare
    const result = r <= 0.25 ? 'pass' : r <= 0.5 ? 'warn' : 'fail'
    add('chk_round', {
      agent: 'integrity',
      name: 'Round-number test',
      result,
      summary: result === 'pass' ? 'Amounts are naturally uneven, the way real takings are.' : `${pct(r)} of daily sales are exact ${figure(P.roundStep, m)} multiples.`,
      detail: `Share of daily sales divisible by ${figure(P.roundStep, m)}: ${pct(r, 1)}. Real takings in the pilot: under 10%.`,
      evidence_refs: result === 'pass' ? [] : a.sales.slice(0, 12).map((e) => e.id),
    })
  }
  {
    const ratio = a.distinct / Math.max(1, a.salesByDate.size)
    const result = ratio >= 0.6 ? 'pass' : ratio >= 0.35 ? 'warn' : 'fail'
    const vals = [...new Set(a.salesByDate.values())].sort((x, y) => x - y)
    add('chk_regular', {
      agent: 'integrity',
      name: 'Too-regular entries',
      result,
      summary: result === 'pass' ? `${a.distinct} different daily totals in ${a.salesByDate.size} days — no copy-paste pattern.` : `Only ${a.distinct} different daily totals in ${a.salesByDate.size} days.`,
      detail: result === 'pass' ? `Distinct daily totals: ${a.distinct}/${a.salesByDate.size}.` : `Values used: ${vals.slice(0, 5).map((v) => figure(v, m)).join(', ')}.`,
      evidence_refs: result === 'pass' ? [] : a.sales.slice(0, 10).map((e) => e.id),
    })
  }

  // Benchmark ----------------------------------------------------------------
  {
    const r = a.peerRatio
    const result = r >= 0.5 && r <= 1.8 ? 'pass' : r <= 2.6 ? 'warn' : 'fail'
    add('chk_peers', {
      agent: 'benchmark',
      name: 'Compared with similar shops',
      result,
      summary:
        result === 'pass'
          ? `Daily sales of ${moneyShort(a.avgDaily, m, 'en')} sit in line with similar ${P.shop}s.`
          : `Notebook daily sales are ${r.toFixed(1)}× the typical ${P.shop} of this kind.`,
      detail: `Notebook average ${money(Math.round(a.avgDaily), m)}/day vs peer median ${money(P.peerDaily, m)}/day (synthetic peer set).`,
      evidence_refs: [...ledger],
    })
  }
  return checks
}

function buildSchedule(amount: number, weekly: number[], market: Application['market'], start = new Date()): ScheduleItem[] {
  const P = POLICY[market]
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  // first due date: the Friday at least 7 days out
  first.setDate(first.getDate() + 7)
  while (first.getDay() !== 5) first.setDate(first.getDate() + 1)
  const dates: string[] = []
  for (let i = 0; i < TENOR; i++) {
    const d = new Date(first)
    d.setDate(first.getDate() + 7 * i)
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  const w = dates.map((d) => weekly[weekOfMonth(d)] || 1)
  const sum = w.reduce((x, y) => x + y, 0)
  const total = Math.round(amount * (1 + FEE))
  const items = dates.map((due_date, i) => ({ week: i + 1, due_date, amount: Math.round((total * w[i]) / sum / P.round) * P.round }))
  const diff = total - items.reduce((x, y) => x + y.amount, 0)
  items[items.length - 1].amount += diff
  return items
}

export function decide(app: Application, a: Analysis, checks: Check[]): { decision: MemoDecision; amount: number; schedule: ScheduleItem[]; haircut: number } {
  const P = POLICY[app.market]
  const failed = (id: string) => checks.some((c) => c.id === id && c.result === 'fail')
  const integrityFail = checks.some((c) => c.agent === 'integrity' && c.result === 'fail') || failed('chk_rhythm') || failed('chk_ghost') || failed('chk_interview_days')
  const reconcileFail = failed('chk_share') || checks.some((c) => c.agent === 'benchmark' && c.result !== 'pass')
  const decision: MemoDecision = integrityFail ? 'refer' : reconcileFail ? 'approve_reduced' : 'approve'
  const haircut = decision === 'approve' ? 1 : 0.5
  const wMax = Math.max(...a.weekly, 1)
  const affordable = (MAX_SHARE * a.weeklyNet * TENOR) / ((1 + FEE) * wMax)
  const byTurnover = P.mult * (a.verified28 / (a.days / 7)) * haircut
  let amount = Math.floor(Math.min(affordable, byTurnover) / P.step) * P.step
  // Like the real policy agent: a referral carries no amount; the officer sizes it after a visit.
  if (decision === 'refer') return { decision, amount: 0, schedule: [], haircut }
  amount = Math.max(P.step, amount)
  return { decision, amount, schedule: buildSchedule(amount, a.weekly, app.market), haircut }
}

// ---------------------------------------------------------------------------
// Memo text. Officer-facing fields in English; borrower-facing in the borrower's language.

function honorific(app: Application, lang: Lang): string {
  const first = app.persona.name.split(/\s+/)[0].toLowerCase()
  if (lang === 'id') return first === 'ibu' || first === 'bu' ? 'Ibu' : first === 'pak' || first === 'bapak' ? 'Bapak' : 'Anda'
  return ''
}

function borrowerMessage(app: Application, decision: MemoDecision, amount: number, lang: Lang): string {
  const P = POLICY[app.market]
  const name = shortName(app.persona)
  const amt = money(amount, app.market)
  const h = honorific(app, lang)
  if (lang === 'id') {
    if (decision === 'approve')
      return `${name}, buku kas ${h} cocok dengan pembayaran ${P.rail}. ${h} bisa meminjam ${amt} selama 26 minggu. Cicilannya lebih besar di minggu ramai, dan lebih kecil saat warung sepi.`
    if (decision === 'approve_reduced')
      return `${name}, ${h} bisa mulai dengan pinjaman ${amt} selama 26 minggu. Angka ini dihitung dari pembayaran ${P.rail} ${h}. Kalau buku kas dan ${P.rail} makin cocok, pinjaman berikutnya bisa lebih besar.`
    return `${name}, terima kasih sudah menunjukkan buku kas ${h}. Kami belum bisa mencocokkan catatan buku dengan pembayaran ${P.rail}. Petugas kami akan datang ke warung ${h} untuk melihat bersama. Setelah itu, ${h} bisa mulai dengan pinjaman kecil.`
  }
  if (lang === 'ta') {
    if (decision === 'approve')
      return `${name}, உங்கள் கணக்குப் புத்தகம் உங்கள் ${P.rail} பரிவர்த்தனைகளுடன் ஒத்துப்போகிறது. நீங்கள் ${amt} கடன் பெறலாம்; 26 வாரங்களில் திருப்பிச் செலுத்தலாம். வியாபாரம் நன்றாக நடக்கும் வாரங்களில் தவணை அதிகம், மந்தமான வாரங்களில் குறைவு.`
    if (decision === 'approve_reduced')
      return `${name}, நீங்கள் ${amt} கடனுடன் தொடங்கலாம்; 26 வாரங்களில் திருப்பிச் செலுத்தலாம். இந்தத் தொகை உங்கள் ${P.rail} பரிவர்த்தனைகளை வைத்துக் கணக்கிடப்பட்டது. புத்தகமும் ${P.rail}-உம் இன்னும் ஒத்துப்போனால், அடுத்த கடன் பெரிதாக இருக்கும்.`
    return `${name}, உங்கள் கணக்குப் புத்தகத்தைக் காட்டியதற்கு நன்றி. புத்தகப் பதிவுகளை உங்கள் ${P.rail} பரிவர்த்தனைகளுடன் இன்னும் ஒப்பிட முடியவில்லை. எங்கள் அலுவலர் உங்கள் கடைக்கு வந்து உங்களுடன் சேர்ந்து பார்ப்பார். அதன் பிறகு சிறிய கடனுடன் தொடங்கலாம்.`
  }
  if (decision === 'approve')
    return `${name}, your notebook matches your ${P.rail} payments. You can borrow ${amt} over 26 weeks. Installments are bigger in your busy weeks and smaller when the shop is quiet.`
  if (decision === 'approve_reduced')
    return `${name}, you can start with a ${amt} loan over 26 weeks. This amount comes from your ${P.rail} payments. As your notebook and ${P.rail} line up more closely, your next loan can be bigger.`
  return `${name}, thank you for showing us your notebook. We couldn't match it with your ${P.rail} payments yet. Our loan officer will visit your shop to look at it together with you. After that, you can start with a small loan.`
}

function coaching(app: Application, decision: MemoDecision, lang: Lang): string[] {
  const rail = POLICY[app.market].rail
  const h = honorific(app, 'id')
  const C = {
    id: {
      approve: [
        `Terus terima pembayaran lewat ${rail} — setiap transaksi menambah bukti usaha ${h}.`,
        'Catat juga belanja kecil seperti gas dan listrik, supaya hitungan untung lebih tepat.',
        `Bayar cicilan tepat waktu selama 3 bulan, lalu ${h} bisa mengajukan pinjaman lebih besar.`,
      ],
      approve_reduced: [
        'Catat jualan setiap hari, sesuai uang yang benar-benar masuk.',
        `Ajak lebih banyak pembeli bayar pakai ${rail} — itu bukti yang paling kuat.`,
        `Setelah 8 minggu buku dan ${rail} cocok, ajukan lagi untuk jumlah lebih besar.`,
      ],
      refer: [
        `Terima pembayaran lewat ${rail} setiap hari, sekecil apa pun.`,
        'Tulis buku kas pada hari jualan terjadi — jangan sekaligus.',
        "Tulis 'tutup' di hari warung tidak buka. Itu juga bukti yang jujur.",
      ],
    },
    ta: {
      approve: [
        `தொடர்ந்து ${rail} மூலம் பணம் பெறுங்கள் — ஒவ்வொரு பரிவர்த்தனையும் உங்கள் வியாபாரத்துக்குச் சான்று.`,
        'எரிவாயு, மின்சாரம் போன்ற சிறிய செலவுகளையும் புத்தகத்தில் எழுதுங்கள்; லாபக் கணக்கு இன்னும் சரியாக இருக்கும்.',
        'மூன்று மாதம் தவணையைச் சரியான நேரத்தில் செலுத்தினால், பெரிய கடனுக்கு விண்ணப்பிக்கலாம்.',
      ],
      approve_reduced: [
        'தினமும் உண்மையில் வந்த பணத்தையே விற்பனையாக எழுதுங்கள்.',
        `அதிக வாடிக்கையாளர்களை ${rail} மூலம் செலுத்தச் சொல்லுங்கள் — அதுவே வலுவான சான்று.`,
        `எட்டு வாரம் புத்தகமும் ${rail}-உம் ஒத்துப்போனால், பெரிய தொகைக்கு மீண்டும் விண்ணப்பியுங்கள்.`,
      ],
      refer: [
        `சிறிய தொகையானாலும் தினமும் ${rail} மூலம் பணம் பெறுங்கள்.`,
        'விற்பனை நடக்கும் அன்றே புத்தகத்தில் எழுதுங்கள் — எல்லாவற்றையும் ஒரே நேரத்தில் அல்ல.',
        "கடை திறக்காத நாட்களில் 'விடுமுறை' என்று எழுதுங்கள். அதுவும் நேர்மையான சான்று.",
      ],
    },
    en: {
      approve: [
        `Keep taking payments by ${rail} — every payment adds to your proof.`,
        'Write down small costs too, like gas and electricity, so your profit is counted correctly.',
        'Pay on time for 3 months and you can apply for a bigger loan.',
      ],
      approve_reduced: [
        'Write down each day’s sales as the money actually comes in.',
        `Ask more customers to pay by ${rail} — it is the strongest proof you have.`,
        `After 8 weeks of your notebook matching ${rail}, apply again for a bigger amount.`,
      ],
      refer: [
        `Take payments by ${rail} every day, even small ones.`,
        'Write in your notebook on the day each sale happens — not all at once.',
        "On days the shop is shut, write 'closed'. That is honest proof too.",
      ],
    },
  } as const
  return [...C[lang][decision === 'decline' ? 'refer' : decision]]
}

export function computeMemo(app: Application, a: Analysis, checks: Check[], lang: Lang, englishFacts?: Record<string, string>): Memo {
  const factsEn = englishFacts ?? {}
  const P = POLICY[app.market]
  const m = app.market
  const { decision, amount, schedule } = decide(app, a, checks)
  const stmt = ev(app, 'statement')
  const ledger = ev(app, 'ledger')
  const wk2 = a.sales.filter((e) => weekOfMonth(e.date) === 1).map((e) => e.id)
  const band = `${pct(P.band[0])}–${pct(P.band[1])}`
  const factId = (field: string) => app.facts.find((f) => f.field === field)?.id
  const years = app.facts.find((f) => f.field === 'years_in_business')
  const purpose = app.facts.find((f) => f.field === 'loan_purpose')
  const w = a.weekly
  const business = businessName(app.persona).toLowerCase()
  const inflation = a.share > 0 ? ((P.band[0] + P.band[1]) / 2) / a.share : 0

  let headline: string
  const reasons: Memo['reasons'] = []
  const risks: Memo['risks'] = []
  if (decision === 'approve') {
    headline = `Genuine, cyclical ${business}. ${P.rail} confirms the notebook. Approve ${money(amount, m)} over ${TENOR} weeks, installments shaped to the payday cycle.`
    reasons.push({ text: `${P.rail} confirms ${pct(a.share)} of notebook sales — inside the ${band} band for ${P.shop}s.`, refs: ['chk_share', ...stmt] })
    reasons.push({ text: `Notebook and ${P.rail} move together day by day (r = ${a.corr.toFixed(2)}), with no sales on idle days.`, refs: ['chk_rhythm', 'chk_ghost', ...a.sales.slice(0, 6).map((e) => e.id)] })
    reasons.push({ text: `Payday cycle: week 1 runs ${w[0].toFixed(2)}× average, week 2 dips to ${w[1].toFixed(2)}×. The schedule follows it.`, refs: wk2 })
    if (years || purpose)
      reasons.push({
        text: `${years ? `${factsEn.years_in_business ?? years.value} trading` : 'Trading history confirmed'}${purpose ? `; loan is for ${(factsEn.loan_purpose ?? purpose.value).toLowerCase()}` : ''} (interview).`,
        refs: [years?.id, purpose?.id].filter(Boolean) as string[],
      })
    risks.push({ text: `Mid-month dip: week-2 cash runs ${pct(1 - w[1])} below average.`, refs: wk2 })
    risks.push({ text: `Purchases look under-recorded (${a.purchases.length} restock lines in ${a.days} days); net cash may be overstated.`, refs: a.purchases.map((e) => e.id) })
    if (!app.facts.length) risks.push({ text: 'Interview skipped: loan purpose not confirmed by the applicant.', refs: [] })
  } else if (decision === 'approve_reduced') {
    headline = `Real business, inflated notebook: sales are ${inflation.toFixed(1)}× what ${P.rail} supports. Lend on ${P.rail}-verified sales only — ${money(amount, m)} over ${TENOR} weeks.`
    reasons.push({ text: `A real, steady business: notebook and ${P.rail} still move together (r = ${a.corr.toFixed(2)}).`, refs: ['chk_rhythm', ...a.sales.slice(0, 6).map((e) => e.id)] })
    reasons.push({ text: `${P.rail} alone supports about ${moneyShort((a.verified28 * 30) / a.days, m, 'en')} a month in sales.`, refs: [...stmt] })
    if (purpose) reasons.push({ text: `Loan purpose: ${(factsEn.loan_purpose ?? purpose.value).toLowerCase()} (interview).`, refs: [purpose.id] })
    const top = [...a.sales].sort((x, y) => y.amount_in - x.amount_in).slice(0, 5).map((e) => e.id)
    risks.push({ text: `Notebook sales are ${inflation.toFixed(1)}× what ${P.rail} supports (digital share ${pct(a.share)} vs ${band}).`, refs: ['chk_share', ...stmt, ...top] })
    risks.push({ text: `Notebook daily sales are ${a.peerRatio.toFixed(1)}× the peer median.`, refs: ['chk_peers', ...ledger] })
  } else {
    headline = `Ledger likely fabricated: ${a.closedDates.length} sales on days ${P.rail} shows the shop closed, round repeated amounts, no day-to-day co-movement. Refer for a field visit; do not lend on this ledger.`
    reasons.push({ text: `${P.rail} shows a real but small shop: about ${moneyShort(a.stmtTotal / a.days, m, 'en')} a day in digital payments.`, refs: [...stmt] })
    reasons.push({ text: `No amount proposed: the notebook cannot be relied on. Size any loan on ${P.rail} after a field visit.`, refs: ['chk_share'] })
    const closedRefs = a.sales.filter((e) => a.closedDates.includes(e.date)).map((e) => e.id)
    if (a.closedDates.length)
      risks.push({ text: `Sales written on ${a.closedDates.length} days when ${P.rail} shows no payments at all.`, refs: ['chk_ghost', ...closedRefs, ...stmt] })
    risks.push({ text: `${pct(a.roundShare)} of daily sales are round ${figure(P.roundStep, m)} multiples; only ${a.distinct} distinct amounts.`, refs: ['chk_round', 'chk_regular', ...a.sales.slice(0, 10).map((e) => e.id)] })
    risks.push({ text: `No co-movement with ${P.rail} (r = ${a.corr.toFixed(2)}): notebook looks written in one sitting.`, refs: ['chk_rhythm', ...stmt] })
    const nc = factId('days_open')
    if (nc && a.closedDates.length) risks.push({ text: `Said the shop never closes; ${P.rail} shows ${a.closedDates.length} closed days.`, refs: [nc, ...stmt] })
  }

  return {
    decision,
    amount,
    tenor_weeks: decision === 'refer' ? 0 : TENOR,
    schedule,
    headline,
    reasons: reasons.slice(0, 4),
    risks,
    coaching: coaching(app, decision, lang),
    borrower_message: borrowerMessage(app, decision, amount, lang),
    citations: [
      { source: 'Bukti lending policy (demo) §3.2 · affordability', text: 'The largest weekly installment must stay at or below 30% of verified weekly net cash.' },
      { source: 'Bukti lending policy (demo) §4.1 · first loans', text: `First loans are capped at ${P.mult}× verified weekly sales, halved while the notebook and ${P.rail} disagree.` },
      { source: `Peer benchmark (synthetic) · ${P.shop}s, ${P.country}`, text: `${P.rail} share of sales p25–p75 ${band}; median daily sales ${money(P.peerDaily, m)}.` },
    ],
    model: 'mock-engine (offline demo)',
  }
}

export function affordabilityCheck(app: Application, a: Analysis, memo: Memo): Check {
  const peak = memo.schedule.length ? Math.max(...memo.schedule.map((s) => s.amount)) : 0
  const share = a.weeklyNet ? peak / a.weeklyNet : 0
  const result = share <= 0.3 ? 'pass' : share <= 0.4 ? 'warn' : 'fail'
  return {
    id: 'chk_afford',
    agent: 'policy',
    name: 'Affordability',
    result,
    summary: `Largest installment is ${pct(share)} of a typical week's net cash${result === 'pass' ? ' — within the 30% limit.' : '.'}`,
    detail: `Peak installment ${money(peak, app.market)} vs verified weekly net cash ${money(Math.round(a.weeklyNet), app.market)}. Policy limit 30%.`,
    evidence_refs: ['chk_share'],
  }
}
