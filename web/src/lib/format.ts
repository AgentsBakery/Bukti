import type { Lang, Market, Persona } from '../api/types'

const ID_NUM = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const IN_NUM = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** Plain grouped figure, as written in the notebook: 544.500 / 5,940 / 1,23,456 */
export function figure(v: number, market: Market): string {
  return (market === 'ID' ? ID_NUM : IN_NUM).format(Math.round(v))
}

/** Full money: "Rp 8.000.000" / "₹48,000" (Indian grouping ₹1,23,456). */
export function money(v: number, market: Market): string {
  const sign = v < 0 ? '−' : ''
  const a = Math.abs(v)
  return market === 'ID' ? `${sign}Rp ${figure(a, market)}` : `${sign}₹${figure(a, market)}`
}

/** Compact money as people say it: "Rp 450rb", "Rp 8,5 jt", "₹5,000", "₹1.2 L". */
export function moneyShort(v: number, market: Market, lang: Lang = market === 'ID' ? 'id' : 'en'): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (market === 'ID') {
    const idStyle = lang === 'id'
    if (a >= 1_000_000) {
      const jt = a / 1_000_000
      const s = (Math.round(jt * 10) / 10).toString().replace('.', idStyle ? ',' : '.')
      return `${sign}Rp ${s}${idStyle ? ' jt' : 'M'}`
    }
    if (a >= 1000) return `${sign}Rp ${Math.round(a / 1000)}${idStyle ? 'rb' : 'k'}`
    return `${sign}Rp ${a}`
  }
  if (a >= 100_000) return `${sign}₹${(Math.round((a / 100_000) * 10) / 10).toString()} L`
  return `${sign}₹${figure(a, market)}`
}

/** "Rp 138rb–229rb" / "₹1,320–1,950" — one currency mark, never split across lines. */
export function moneyRange(min: number, max: number, market: Market, lang: Lang = market === 'ID' ? 'id' : 'en'): string {
  const strip = (s: string) => s.replace(/^Rp\s?/, '').replace(/^₹/, '')
  const cur = market === 'ID' ? 'Rp\u00a0' : '₹'
  return `${cur}${strip(moneyShort(min, market, lang))}\u2060–\u2060${strip(moneyShort(max, market, lang))}`.replace(/ /g, '\u00a0')
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`
}

export function locale(lang: Lang, market?: Market): string {
  if (lang === 'id') return 'id-ID'
  if (lang === 'ta') return 'ta-IN'
  return market === 'ID' ? 'en-GB' : 'en-IN'
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtDate(iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }, market?: Market): string {
  return new Intl.DateTimeFormat(locale(lang, market), opts).format(parseISODate(iso))
}

/** "1/9" — how dates sit in the notebook margin. */
export function notebookDate(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** How to address the borrower: "Ibu Sari", "Pak Joko", "Murugan". */
export function shortName(persona: Persona): string {
  const parts = persona.name.trim().split(/\s+/)
  if (/^(ibu|bu|pak|bapak|mbak|mas)$/i.test(parts[0]) && parts.length > 1) return `${parts[0]} ${parts[1]}`
  return parts[0]
}

export function firstName(persona: Persona): string {
  const parts = persona.name.trim().split(/\s+/)
  if (/^(ibu|bu|pak|bapak|mbak|mas)$/i.test(parts[0]) && parts.length > 1) return parts[1]
  return parts[0]
}

export function initials(persona: Persona): string {
  const parts = persona.name.replace(/^(ibu|bu|pak|bapak)\s+/i, '').split(/\s+/)
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** Week-of-month bucket (0..3) used for the cash-flow pattern. */
export function weekOfMonth(iso: string): number {
  return Math.min(3, Math.floor((parseISODate(iso).getDate() - 1) / 7))
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
