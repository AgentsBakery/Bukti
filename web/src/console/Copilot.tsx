import { ArrowUp, Check, Eye, FileSearch, MessageSquarePlus, Sparkles, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Unsubscribe } from '../api/client'
import type { Application } from '../api/types'
import { Kawung } from '../components/Kawung'
import { parseISODate } from '../lib/format'
import { useLink } from './link'
import { RefChips } from './RefChips'

export const SUGGESTED = [
  'Why are sales lower in week 2?',
  'Which days don’t match the QRIS records?',
  'Is this notebook genuine?',
  'What should I ask the borrower before approving?',
]

interface ToolCall {
  name: string
  args: Record<string, unknown>
  done: boolean
}
interface Turn {
  id: number
  question: string
  tools: ToolCall[]
  highlights: { refs: string[]; note: string }[]
  text: string
  refs: string[]
  final: boolean
  streaming: boolean
  error: string | null
}

function span(args: Record<string, unknown>): string | null {
  const from = (args.date_from ?? args.start ?? args.from) as string | undefined
  const to = (args.date_to ?? args.end ?? args.to) as string | undefined
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}/.test(d)
  if (!ok(from) && !ok(to)) return null
  const a = parseISODate((from ?? to)!)
  const b = parseISODate((to ?? from)!)
  const mon = (d: Date) => d.toLocaleString('en-GB', { month: 'short' })
  if (a.getTime() === b.getTime()) return `${a.getDate()} ${mon(a)}`
  return mon(a) === mon(b) ? `${a.getDate()}–${b.getDate()} ${mon(b)}` : `${a.getDate()} ${mon(a)} – ${b.getDate()} ${mon(b)}`
}

/** Plain words for the agent's tool calls: "Looking at 8–14 Sep entries…" */
export function toolLabel(name: string, args: Record<string, unknown>, rail: string): string {
  const r = span(args)
  switch (name) {
    case 'get_checks':
      return 'Reading the checks'
    case 'get_case_summary':
      return 'Reading the case summary'
    case 'get_interview_facts':
      return 'Re-reading the interview'
    case 'compare_with_payments':
      return `Comparing the notebook with ${rail}`
    case 'highlight_evidence':
      return 'Marking the proof on the photo'
    case 'get_schedule':
      return 'Reading the repayment schedule'
    case 'get_entries':
      return r ? `Looking at ${r} entries` : 'Looking at the notebook lines'
    case 'get_statement':
      return r ? `Reading ${rail} for ${r}` : `Reading the ${rail} statement`
    case 'get_metrics':
      return 'Checking the numbers'
    case 'get_facts':
      return 'Re-reading the interview'
    case 'get_memo':
      return 'Reading the memo'
    case 'get_policy':
      return 'Checking the lending policy'
    case 'get_peers':
    case 'get_benchmark':
      return 'Comparing with similar shops'
    default:
      return name.replace(/^get_/, 'Reading ').replace(/_/g, ' ')
  }
}

const REF = /^(chk_[\w]+|en_[\w]+|ev_[\w]+|F\d+|day:\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/

/** An inline citation the model wrote as [chk_round] — a tiny chip that lights up its proof. */
function InlineRef({ app, refs }: { app: Application; refs: string[] }) {
  const { hover, pin } = useLink()
  const label = (r: string) => {
    const c = app.checks.find((x) => x.id === r)
    if (c) return c.name
    const e = app.entries.find((x) => x.id === r)
    if (e) return `${Number(e.date.slice(8))}/${Number(e.date.slice(5, 7))} ${e.description}`
    const f = app.facts.find((x) => x.id === r)
    if (f) return f.label
    const v = app.evidence.find((x) => x.id === r)
    if (v) return v.label
    return r.replace('day:', '')
  }
  const text = refs.length > 2 ? `${label(refs[0])} +${refs.length - 1}` : refs.map(label).join(', ')
  return (
    <button
      type="button"
      onMouseEnter={() => hover(refs, 'copilot')}
      onMouseLeave={() => hover(null)}
      onFocus={() => hover(refs, 'copilot')}
      onBlur={() => hover(null)}
      onClick={() => pin(refs, 'copilot', { toggle: false })}
      className="mx-0.5 inline-flex max-w-[220px] translate-y-[-1px] items-center rounded-md border border-turmeric-deep/40 bg-turmeric/20 px-1.5 align-middle text-[11px] font-bold leading-[18px] text-soot hover:bg-turmeric/45"
    >
      <span className="truncate">{text}</span>
    </button>
  )
}

/** Split text into plain, **bold** and [ref] segments by scanning — no regex, so no backtracking. */
function segments(text: string): string[] {
  const out: string[] = []
  let buf = ''
  let i = 0
  while (i < text.length) {
    const close = text.startsWith('**', i) ? text.indexOf('**', i + 2) : text[i] === '[' ? text.indexOf(']', i + 1) : -1
    if (close > i + 1) {
      const end = text.startsWith('**', i) ? close + 2 : close + 1
      if (buf) out.push(buf)
      out.push(text.slice(i, end))
      buf = ''
      i = end
      continue
    }
    buf += text[i]
    i += 1
  }
  if (buf) out.push(buf)
  return out
}

function Inline({ app, text }: { app: Application; text: string }) {
  const parts = segments(text)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i} className="font-extrabold text-soot">{p.slice(2, -2)}</strong>
        if (p.startsWith('[') && p.endsWith(']')) {
          const refs = p.slice(1, -1).split(',').map((r) => r.trim()).filter((r) => REF.test(r))
          if (refs.length) return <InlineRef key={i} app={app} refs={refs} />
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

/** Classify one line as a bullet, a numbered item or plain text — string scanning, no regex. */
function listItem(line: string): { kind: 'p' | 'ul' | 'ol'; body: string } {
  if ((line.startsWith('* ') || line.startsWith('- ') || line.startsWith('• ')) && line.length > 2) return { kind: 'ul', body: line.slice(2).trim() }
  let i = 0
  while (i < line.length && line.charCodeAt(i) >= 48 && line.charCodeAt(i) <= 57) i++
  if (i > 0 && i < 4 && (line[i] === '.' || line[i] === ')') && line[i + 1] === ' ') return { kind: 'ol', body: line.slice(i + 2).trim() }
  return { kind: 'p', body: line }
}

/** Just enough Markdown for the copilot: paragraphs, bullet and numbered lists, bold, [ref] citations. */
function Prose({ app, text, caret }: { app: Application; text: string; caret: boolean }) {
  const lines = text.split('\n')
  const blocks: { kind: 'p' | 'ul' | 'ol'; items: string[] }[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const { kind, body } = listItem(line)
    const last = blocks[blocks.length - 1]
    if (kind !== 'p' && last?.kind === kind) last.items.push(body)
    else blocks.push({ kind, items: [body] })
  }
  const Caret = () => <span className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] animate-pulse bg-ink" aria-hidden />
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-soot">
      {blocks.map((b, i) => {
        const end = caret && i === blocks.length - 1
        if (b.kind === 'p')
          return (
            <p key={i}>
              <Inline app={app} text={b.items[0]} />
              {end ? <Caret /> : null}
            </p>
          )
        const List = b.kind === 'ul' ? 'ul' : 'ol'
        return (
          <List key={i} className={`space-y-1.5 pl-5 ${b.kind === 'ul' ? 'list-[square] marker:text-turmeric-deep' : 'list-decimal marker:font-bold marker:text-ink'}`}>
            {b.items.map((it, j) => (
              <li key={j} className="pl-0.5">
                <Inline app={app} text={it} />
                {end && j === b.items.length - 1 ? <Caret /> : null}
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}

function Answer({ app, turn, rail, onRepin, onRetry }: { app: Application; turn: Turn; rail: string; onRepin: (refs: string[]) => void; onRetry?: () => void }) {
  const hasText = turn.text.trim().length > 0
  return (
    <div className="relative rounded-2xl border border-soot/12 bg-card px-4 pb-3.5 pt-3 shadow-[0_1px_0_rgb(255_255_255/0.7)_inset,0_10px_24px_-20px_rgb(60_40_10/0.8)]">
      {turn.tools.length ? (
        <ul className="mb-2.5 flex flex-wrap gap-1.5" aria-label="What the copilot looked at">
          {turn.tools.map((tc, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-bold ${tc.done ? 'border-ink/25 text-soot-2' : 'border-ink text-ink'}`}
              title={`${tc.name}(${JSON.stringify(tc.args)})`}
            >
              {tc.done ? <Check size={12} strokeWidth={3} className="text-leaf" aria-hidden /> : <Kawung size={13} spin />}
              {toolLabel(tc.name, tc.args, rail)}
              {tc.done ? '' : '…'}
            </motion.li>
          ))}
        </ul>
      ) : null}
      {turn.highlights.map((h, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onRepin(h.refs)}
          className="mb-2.5 flex items-center gap-1.5 rounded-lg bg-turmeric/25 px-2 py-1 text-left text-[12px] font-bold text-soot hover:bg-turmeric/40"
        >
          <Eye size={13} aria-hidden /> {h.note || 'Highlighted on the photo'}
          <span className="font-normal text-soot-2">· show again</span>
        </button>
      ))}
      {hasText ? (
        <Prose app={app} text={turn.text} caret={turn.streaming && !turn.final} />
      ) : turn.streaming ? (
        <p className="font-hand flex items-center gap-2 text-[16px] text-soot-2">
          <Kawung size={16} spin /> thinking it through…
        </p>
      ) : null}
      {turn.error ? (
        <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-chili/25 bg-chili/6 px-3 py-2">
          <p className="text-[13px] font-bold leading-snug text-chili-ink">{turn.error.trim().replace(/:$/, '') || 'The copilot could not answer that.'}</p>
          {!turn.streaming && onRetry ? (
            <button type="button" onClick={onRetry} className="shrink-0 rounded-lg border border-ink/30 px-2 py-0.5 text-[12px] font-bold text-ink hover:border-ink">
              Ask again
            </button>
          ) : null}
        </div>
      ) : null}
      {turn.final && turn.refs.length ? (
        <div className="mt-2.5 border-t border-dashed border-soot/15 pt-2">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-soot-3">Cited</span>
          <RefChips app={app} refs={turn.refs} size="xs" />
        </div>
      ) : null}
    </div>
  )
}

/** "Ask about this case": a tool-using agent over this one application. */
export function Copilot({ app, model }: { app: Application; model?: string }) {
  const { pin } = useLink()
  const [turns, setTurns] = useState<Turn[]>([])
  const [session, setSession] = useState<string | undefined>()
  const [input, setInput] = useState('')
  const stop = useRef<Unsubscribe | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const counter = useRef(0)
  const rail = app.market === 'ID' ? 'QRIS' : 'UPI'
  const busy = turns.some((t) => t.streaming)
  const suggestions = SUGGESTED.map((q) => q.replace('QRIS', rail))

  useEffect(() => () => stop.current?.(), [])
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const patch = (id: number, fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)))

  const ask = (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    const id = ++counter.current
    setInput('')
    setTurns((ts) => [...ts, { id, question, tools: [], highlights: [], text: '', refs: [], final: false, streaming: true, error: null }])
    stop.current = api.copilot(app.id, { question, session_id: session }, (e) => {
      switch (e.type) {
        case 'session':
          setSession(e.session_id)
          break
        case 'tool':
          patch(id, (t) => {
            const args = e.args ?? {}
            const sig = `${e.name}:${JSON.stringify(args)}`
            // the same call reported again in this turn is the same call
            if (t.tools.some((x) => `${x.name}:${JSON.stringify(x.args)}` === sig)) return t
            return { ...t, tools: [...t.tools.map((x) => ({ ...x, done: true })), { name: e.name, args, done: false }] }
          })
          break
        case 'highlight':
          patch(id, (t) => ({ ...t, highlights: [...t.highlights, { refs: e.refs, note: e.note }] }))
          if (e.refs.length) pin(e.refs, 'copilot', { toggle: false })
          break
        case 'answer_delta':
          patch(id, (t) => ({ ...t, tools: t.tools.map((x) => ({ ...x, done: true })), text: t.text + e.text }))
          break
        case 'answer':
          patch(id, (t) => ({ ...t, text: e.text, refs: e.refs ?? [], final: true }))
          break
        case 'error':
          patch(id, (t) => ({ ...t, error: e.message || 'The copilot could not answer that.' }))
          break
        case 'done':
          patch(id, (t) => ({ ...t, streaming: false, tools: t.tools.map((x) => ({ ...x, done: true })) }))
          stop.current = null
          break
      }
    })
  }

  const cancel = () => {
    stop.current?.()
    stop.current = null
    setTurns((ts) => ts.map((t) => (t.streaming ? { ...t, streaming: false, error: t.text ? null : 'Stopped.' } : t)))
  }

  const reset = () => {
    cancel()
    setTurns([])
    setSession(undefined)
  }

  return (
    <section className="paper-card flex h-full min-h-0 flex-col overflow-hidden" aria-label="Officer copilot">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-soot/10 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <h2 className="font-display flex items-center gap-2 text-[20px] leading-tight text-ink">
            <Sparkles size={17} className="text-turmeric-deep" aria-hidden /> Ask about this case
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-soot-2">
            Reads the checks, notebook lines and {rail} before answering, and cites what it used.
            {model ? <span className="font-mono ml-1 rounded bg-ink/8 px-1 text-[10.5px] text-ink-soft">{model}</span> : null}
          </p>
        </div>
        {turns.length ? (
          <button type="button" onClick={reset} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] font-bold text-soot-2 hover:bg-paper-2 hover:text-ink">
            <MessageSquarePlus size={14} aria-hidden /> New chat
          </button>
        ) : null}
      </header>

      <div ref={box} className="thin-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {!turns.length ? (
          <div className="flex h-full flex-col justify-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-ink/30 text-ink">
              <FileSearch size={24} aria-hidden />
            </div>
            <p className="font-display mx-auto mt-3 max-w-[30ch] text-center text-[18px] leading-snug text-ink">Ask anything about {app.persona.name.split(' ').slice(0, 2).join(' ')}’s case.</p>
            <p className="font-hand mx-auto mt-1 text-center text-[16px] text-soot-2">answers light up the proof on the photo</p>
            <ul className="mt-5 grid gap-2">
              {suggestions.map((q, i) => (
                <motion.li key={q} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                  <button
                    type="button"
                    onClick={() => ask(q)}
                    className="w-full rounded-xl border border-soot/15 bg-paper/70 px-3.5 py-2.5 text-left text-[13.5px] font-bold text-ink transition-colors hover:border-ink/40 hover:bg-card"
                  >
                    {q}
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {turns.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13.5px] font-bold leading-snug text-paper">{t.question}</p>
              </div>
              <Answer app={app} turn={t} rail={rail} onRepin={(refs) => pin(refs, 'copilot', { toggle: false })} onRetry={t.error ? () => ask(t.question) : undefined} />
            </motion.div>
          ))}
        </AnimatePresence>
        {turns.length && !busy ? (
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {suggestions
              .filter((q) => !turns.some((t) => t.question === q))
              .map((q) => (
                <button key={q} type="button" onClick={() => ask(q)} className="shrink-0 rounded-full border border-soot/15 bg-paper/70 px-3 py-1 text-[12px] font-bold text-soot-2 hover:border-ink/40 hover:text-ink">
                  {q}
                </button>
              ))}
          </div>
        ) : null}
      </div>

      <form
        className="shrink-0 border-t border-soot/10 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-soot/20 bg-paper px-3 py-2 focus-within:border-ink">
          <label htmlFor="copilot-input" className="sr-only">
            Ask about this case
          </label>
          <textarea
            id="copilot-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask(input)
              }
            }}
            placeholder="Ask about this case…"
            className="max-h-24 min-h-[26px] flex-1 resize-none bg-transparent text-[14px] text-soot outline-none placeholder:text-soot-3"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          {busy ? (
            <button type="button" onClick={cancel} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-ink text-ink" aria-label="Stop">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-paper disabled:opacity-35" aria-label="Ask">
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
