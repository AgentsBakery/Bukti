import { FileText, Hash, MessageSquareQuote, NotebookPen, ShieldCheck } from 'lucide-react'
import type { Application } from '../api/types'
import { useLink } from './link'

const DOT = { pass: 'bg-leaf', warn: 'bg-turmeric', fail: 'bg-chili' }

/** Friendly chips for a list of refs. Each chip links to what it names. */
export function RefChips({ app, refs, size = 'sm' }: { app: Application; refs: string[]; size?: 'sm' | 'xs' }) {
  const { hover, pin, refs: activeRefs, pinned } = useLink()
  if (!refs.length) return null
  const entries = refs.filter((r) => app.entries.some((e) => e.id === r))
  const chips: { key: string; refs: string[]; label: string; icon: React.ReactNode; dot?: string }[] = []
  for (const r of refs) {
    const c = app.checks.find((x) => x.id === r)
    if (c) chips.push({ key: r, refs: [r], label: c.name, icon: <ShieldCheck size={11} aria-hidden />, dot: DOT[c.result] })
    const ev = app.evidence.find((x) => x.id === r)
    if (ev) chips.push({ key: r, refs: [r], label: ev.label, icon: ev.type === 'ledger' ? <NotebookPen size={11} aria-hidden /> : <FileText size={11} aria-hidden /> })
    const f = app.facts.find((x) => x.id === r)
    if (f) chips.push({ key: r, refs: [r], label: f.label, icon: <MessageSquareQuote size={11} aria-hidden /> })
  }
  if (entries.length)
    chips.push({ key: 'entries', refs: entries, label: `${entries.length} notebook line${entries.length > 1 ? 's' : ''}`, icon: <Hash size={11} aria-hidden /> })
  const isOn = (r: string[]) => pinned && activeRefs.join() === r.join()
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <button
          type="button"
          key={c.key}
          onMouseEnter={() => hover(c.refs, 'memo')}
          onMouseLeave={() => hover(null)}
          onFocus={() => hover(c.refs, 'memo')}
          onBlur={() => hover(null)}
          onClick={(e) => {
            e.stopPropagation()
            pin(c.refs, 'memo')
          }}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 font-bold transition-colors ${size === 'xs' ? 'h-5 text-[10px]' : 'h-[22px] text-[10.5px]'} ${
            isOn(c.refs) ? 'border-ink bg-ink text-paper' : 'border-soot/15 bg-paper/70 text-soot-2 hover:border-turmeric-deep hover:bg-turmeric/25 hover:text-soot'
          }`}
        >
          {c.dot ? <i className={`h-1.5 w-1.5 rounded-full ${c.dot}`} /> : c.icon}
          {c.label}
        </button>
      ))}
    </span>
  )
}
