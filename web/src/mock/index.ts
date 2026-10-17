// In-browser implementation of the whole Bukti contract for VITE_MOCK=1.
// Streams are timers; the interview is a scripted conversation with synthetic voice levels.
import {
  ApiError,
  type BuktiApi,
  type InterviewConnection,
  type InterviewHandlers,
  type StreamHandlers,
  type Unsubscribe,
} from '../api/client'
import {
  AGENT_ORDER,
  type AgentName,
  type Application,
  type ApplicationSummary,
  type Check,
  type Entry,
  type Evidence,
  type EvidenceType,
  type Fact,
  type Lang,
  type StatementDay,
  type StreamEvent,
} from '../api/types'
import { money, pct } from '../lib/format'
import { affordabilityCheck, analyse, computeChecks, computeMemo, computeMetrics, POLICY } from './engine'
import { scriptFor } from './interviewScript'
import { loadLayout, MOCK_PACKS, packLang, type PackLayout } from './packs'
import { store } from './store'

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
const now = () => new Date().toISOString()
const rand = () => Math.random().toString(36).slice(2, 6)

function setTrace(app: Application, agent: AgentName, status: Application['agent_trace'][number]['status'], summary: string) {
  const step = app.agent_trace.find((s) => s.agent === agent)
  if (!step) return
  step.status = status
  step.summary = summary
  if (status === 'running') {
    step.started_at = now()
    step.ended_at = undefined
  }
  if (status === 'done' || status === 'error') step.ended_at = now()
}

function newApplication(partial: Pick<Application, 'persona' | 'market' | 'language'> & { pack_id: string | null }): Application {
  return {
    id: `app_${partial.pack_id ?? 'new'}_${rand()}`,
    pack_id: partial.pack_id,
    persona: partial.persona,
    market: partial.market,
    language: partial.language,
    currency: partial.market === 'ID' ? 'Rp' : '₹',
    status: 'draft',
    created_at: now(),
    evidence: [],
    entries: [],
    statement: [],
    facts: [],
    checks: [],
    metrics: null,
    memo: null,
    agent_trace: AGENT_ORDER.map((agent) => ({ agent, status: 'pending', summary: '' })),
    decision: null,
  }
}

function packEvidence(appId: string, packId: string, L: PackLayout): Evidence[] {
  const rail = L.meta.rail
  return [
    { id: `ev_${appId}_p1`, type: 'ledger', label: 'Ledger page 1', url: `/mock/${packId}/page1.jpg`, width: L.images.page1[0], height: L.images.page1[1] },
    { id: `ev_${appId}_p2`, type: 'ledger', label: 'Ledger page 2', url: `/mock/${packId}/page2.jpg`, width: L.images.page2[0], height: L.images.page2[1] },
    { id: `ev_${appId}_st`, type: 'statement', label: `${rail} statement`, url: `/mock/${packId}/statement.png`, width: L.images.statement[0], height: L.images.statement[1] },
  ]
}

function getOr404(id: string): Application {
  const a = store.get(id)
  if (!a) throw new ApiError(404, `Application ${id} not found`)
  return a
}

/** Runs an async producer as a cancellable "SSE" stream. */
function stream(handlers: StreamHandlers, produce: (emit: (e: StreamEvent) => void, alive: () => boolean) => Promise<void>): Unsubscribe {
  let alive = true
  const emit = (e: StreamEvent) => {
    if (alive) handlers.onEvent(e)
  }
  produce(emit, () => alive).catch((err) => emit({ type: 'error', message: err instanceof Error ? err.message : String(err) }))
  return () => {
    alive = false
  }
}

const LANG_NAME: Record<Lang, string> = { id: 'Bahasa Indonesia', ta: 'Tamil', en: 'English' }

async function downscale(file: Blob): Promise<{ url: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  return { url: canvas.toDataURL('image/jpeg', 0.82), width: w, height: h }
}

function englishFacts(app: Application): Record<string, string> {
  const script = scriptFor(app, 0, false)
  const out: Record<string, string> = {}
  for (const t of script) for (const f of t.facts ?? []) out[f.field] = f.value.en
  return out
}

export function createMockApi(): BuktiApi {
  return {
    mode: 'mock',

    async health() {
      return { ok: true, version: 'mock', models: { note: 'in-browser mock, no models called' } }
    },

    async listPacks() {
      await sleep(120)
      return MOCK_PACKS
    },

    async loadPack(packId) {
      const L = await loadLayout(packId)
      const pack = MOCK_PACKS.find((p) => p.id === packId)!
      const app = newApplication({ pack_id: packId, persona: pack.persona, market: pack.market, language: packLang(packId) })
      app.evidence = packEvidence(app.id, packId, L)
      store.put(app)
      await sleep(350)
      return { application_id: app.id }
    },

    async createApplication(body) {
      const app = newApplication({
        pack_id: null,
        persona: body.persona ?? { name: 'New applicant', business: 'Small shop', city: '' },
        market: body.market,
        language: body.language,
      })
      store.put(app)
      return { application_id: app.id }
    },

    async uploadEvidence(appId, file, type: EvidenceType) {
      const app = getOr404(appId)
      const img = await downscale(file)
      const n = app.evidence.filter((e) => e.type === type).length + 1
      const rail = POLICY[app.market].rail
      const label = type === 'ledger' ? `Ledger page ${n}` : type === 'statement' ? `${rail} statement${n > 1 ? ` ${n}` : ''}` : type === 'receipt' ? `Receipt ${n}` : 'Shop photo'
      const ev: Evidence = { id: `ev_${appId}_u${rand()}`, type, label, url: img.url, width: img.width, height: img.height }
      store.update(appId, (a) => {
        a.evidence.push(ev)
      })
      await sleep(250)
      return ev
    },

    async getApplication(appId) {
      return getOr404(appId)
    },

    async listApplications(): Promise<ApplicationSummary[]> {
      return store
        .list()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((a) => ({
          id: a.id,
          persona: a.persona,
          market: a.market,
          status: a.status,
          created_at: a.created_at,
          amount: a.decision?.amount ?? a.memo?.amount,
          decision: a.decision?.action ?? a.memo?.decision,
        }))
    },

    extractStream(appId, handlers) {
      return stream(handlers, async (emit, alive) => {
        const app = getOr404(appId)
        const L = app.pack_id ? await loadLayout(app.pack_id) : null
        const ledgers = app.evidence.filter((e) => e.type === 'ledger')
        const statementEv = app.evidence.find((e) => e.type === 'statement')
        const intro = `Reading ${ledgers.length} notebook page${ledgers.length === 1 ? '' : 's'}${statementEv ? ` and the ${POLICY[app.market].rail} statement` : ''}`
        store.update(appId, (a) => {
          a.status = 'extracting'
          a.entries = []
          a.statement = []
          setTrace(a, 'extractor', 'running', intro)
        })
        emit({ type: 'agent', agent: 'extractor', status: 'running', summary: intro })
        // Like the real extractor: all pages are scanned in parallel, then each page's lines
        // arrive together. The UI paces the lift-off animation itself.
        for (const ev of ledgers) emit({ type: 'evidence_scan', evidence_id: ev.id })
        await sleep(2600)
        for (const ev of ledgers) {
          if (!alive()) return
          const page = ev.id.endsWith('_p1') ? 1 : ev.id.endsWith('_p2') ? 2 : 0
          const lines = L && page ? L.entries.filter((e) => e.page === page) : []
          for (const le of lines) {
            if (!alive()) return
            const entry: Entry = {
              id: `en_p${le.page}_${String(le.line).padStart(2, '0')}`,
              evidence_id: ev.id,
              date: le.date,
              description: le.description,
              amount_in: le.amount_in,
              amount_out: le.amount_out,
              bbox: le.bbox,
              row_bbox: le.row_bbox,
              confidence: Math.round((0.9 + ((le.line * 37 + le.page * 11) % 9) / 100) * 100) / 100,
            }
            store.update(appId, (a) => {
              a.entries.push(entry)
            })
            emit({ type: 'entry', entry })
            await sleep(25)
          }
          await sleep(1400)
        }
        if (statementEv && L) {
          for (const d of L.statement) {
            if (!alive()) return
            const day: StatementDay = { date: d.date, transactions: d.transactions, total: d.total, evidence_id: statementEv.id, bbox: d.bbox }
            store.update(appId, (a) => {
              a.statement.push(day)
            })
            emit({ type: 'statement_day', day })
            await sleep(15)
          }
        }
        const final = store.update(appId, (a) => {
          a.status = 'extracted'
          const pages = new Set(a.entries.map((e) => e.evidence_id)).size
          setTrace(a, 'extractor', 'done', `Read ${a.entries.length} lines from ${pages} page${pages === 1 ? '' : 's'} · ${a.statement.length} days of ${POLICY[a.market].rail}`)
        })
        await sleep(300)
        emit({ type: 'agent', agent: 'extractor', status: 'done', summary: final.agent_trace[0].summary })
        emit({ type: 'done', application: final })
      })
    },

    assessStream(appId, handlers) {
      return stream(handlers, async (emit, alive) => {
        let app = getOr404(appId)
        const P = POLICY[app.market]
        app = store.update(appId, (a) => {
          a.status = 'assessing'
          a.checks = []
          a.memo = null
          const iv = a.agent_trace.find((s) => s.agent === 'interviewer')
          if (iv && iv.status !== 'done') {
            iv.status = 'done'
            iv.summary = 'Skipped by the applicant'
          }
          for (const s of a.agent_trace) if (s.agent !== 'extractor' && s.agent !== 'interviewer') Object.assign(s, { status: 'pending', summary: '', started_at: undefined, ended_at: undefined })
        })
        const a = analyse(app)
        const checks = computeChecks(app, a)
        const metrics = computeMetrics(app, a)

        const runAgent = async (agent: AgentName, running: string, body: () => Promise<string>) => {
          if (!alive()) throw new Error('cancelled')
          store.update(appId, (x) => setTrace(x, agent, 'running', running))
          emit({ type: 'agent', agent, status: 'running', summary: running })
          await sleep(900)
          const done = await body()
          store.update(appId, (x) => setTrace(x, agent, 'done', done))
          emit({ type: 'agent', agent, status: 'done', summary: done })
          await sleep(350)
        }
        const emitChecks = async (list: Check[]) => {
          for (const c of list) {
            if (!alive()) return
            store.update(appId, (x) => {
              x.checks.push(c)
            })
            emit({ type: 'check', check: c })
            await sleep(520)
          }
        }
        const by = (agent: AgentName) => checks.filter((c) => c.agent === agent)
        const tally = (list: Check[]) => {
          const f = list.filter((c) => c.result === 'fail').length
          const w = list.filter((c) => c.result === 'warn').length
          return f ? `${f} failed${w ? `, ${w} to watch` : ''}` : w ? `${w} to watch` : 'all passed'
        }

        try {
          await runAgent('reconciler', `Matching ${app.statement.length} notebook days against ${P.rail}`, async () => {
            await emitChecks(by('reconciler'))
            store.update(appId, (x) => {
              x.metrics = metrics
            })
            emit({ type: 'metrics', metrics })
            return `${P.rail} covers ${pct(a.share)} of notebook sales · r = ${a.corr.toFixed(2)} · ${tally(by('reconciler'))}`
          })
          await runAgent('integrity', 'Testing for round numbers, repeats and closed-day sales', async () => {
            await emitChecks(by('integrity'))
            return `${by('integrity').length} forensic tests · ${tally(by('integrity'))}`
          })
          await runAgent('benchmark', `Comparing with similar ${P.shop}s`, async () => {
            await emitChecks(by('benchmark'))
            return a.peerRatio <= 1.8 ? 'In line with peers' : `${a.peerRatio.toFixed(1)}× the peer median`
          })
          const lang = store.get(appId)!.language
          const fresh = store.get(appId)!
          const memo = computeMemo(fresh, analyse(fresh), checks, lang, englishFacts(fresh))
          const afford = affordabilityCheck(fresh, a, memo)
          await runAgent('policy', 'Sizing the loan to weekly cash', async () => {
            await emitChecks([afford])
            if (!memo.amount) return 'No amount proposed — refer to the loan officer'
            const peak = Math.max(...memo.schedule.map((s) => s.amount))
            return `${money(memo.amount, app.market)} · ${memo.tenor_weeks} weeks · peak ${pct(peak / Math.max(1, a.weeklyNet))} of weekly net`
          })
          await runAgent('memo', 'Writing the credit memo', async () => {
            await sleep(3200)
            store.update(appId, (x) => {
              x.memo = memo
            })
            emit({ type: 'memo', memo })
            return `Memo ready · ${memo.decision.replace('_', ' ')}`
          })
        } catch (err) {
          if ((err as Error).message === 'cancelled') return
          throw err
        }
        const final = store.update(appId, (x) => {
          x.status = 'ready'
        })
        emit({ type: 'done', application: final })
      })
    },

    async decide(appId, body) {
      const app = getOr404(appId)
      if (!app.memo) throw new ApiError(409, 'Nothing to decide yet')
      await sleep(250)
      return store.update(appId, (a) => {
        a.decision = {
          action: body.action,
          amount: body.action === 'decline' ? 0 : body.amount ?? a.memo!.amount,
          note: body.note ?? '',
          officer: a.market === 'ID' ? 'Putri Anggraini' : 'Kavitha Raman',
          ts: now(),
        }
        a.status = 'decided'
      })
    },

    async explainAudio() {
      throw new ApiError(501, 'No audio in mock mode')
    },

    async tts() {
      throw new ApiError(501, 'No TTS in mock mode')
    },

    async openInterview(appId, lang, h: InterviewHandlers): Promise<InterviewConnection> {
      const app = getOr404(appId)
      const L = app.pack_id ? await loadLayout(app.pack_id) : null
      const sales = L ? L.entries.reduce((s, e) => s + e.amount_in, 0) : 0
      const avg = L ? sales / L.meta.days : 0
      const script = scriptFor(app, avg, L?.meta.label === 'fabricated')
      store.update(appId, (a) => {
        a.language = lang
        a.facts = []
        setTrace(a, 'interviewer', 'running', `Live interview in ${LANG_NAME[lang]}`)
      })
      let closed = false
      let ending = false
      let speaking: 'agent' | 'user' | null = null
      let muted = false
      const phase = Math.random() * 10
      const facts: Fact[] = []

      const run = async () => {
        await sleep(700)
        h.onOpen?.()
        for (let i = 0; i < script.length; i++) {
          if (closed) return
          if (ending && i < script.length - 1) i = script.length - 1
          const turn = script[i]
          const text = turn.text[lang]
          const words = text.split(/\s+/)
          speaking = turn.role
          if (turn.role === 'agent') h.onSpeaking?.(true)
          const perWord = turn.role === 'agent' ? 205 : 235
          // Contract: final:false events are fragments to APPEND; final:true carries the whole utterance.
          for (let k = 0; k < words.length; k += 2) {
            if (closed) return
            const frag = (k === 0 ? '' : ' ') + words.slice(k, k + 2).join(' ')
            h.onTranscript?.({ role: turn.role, text: frag, final: false, en: lang === 'en' ? undefined : turn.text.en })
            await sleep(perWord * 2)
          }
          h.onTranscript?.({ role: turn.role, text, final: true, en: lang === 'en' ? undefined : turn.text.en })
          speaking = null
          if (turn.role === 'agent') h.onSpeaking?.(false)
          for (const f of turn.facts ?? []) {
            await sleep(420)
            if (closed) return
            const fact: Fact = { id: `F${facts.length + 1}`, field: f.field, label: f.label, value: f.value[lang], quote: text, ts: now() }
            facts.push(fact)
            store.update(appId, (a) => {
              a.facts.push(fact)
            })
            h.onFact?.(fact)
          }
          await sleep(turn.role === 'agent' ? 650 : 800)
        }
        if (closed) return
        store.update(appId, (a) => {
          a.status = a.status === 'extracted' || a.status === 'draft' ? 'interviewed' : a.status
          setTrace(a, 'interviewer', 'done', `${facts.length} facts captured in ${LANG_NAME[lang]}`)
        })
        h.onDone?.(facts)
      }
      void run()

      const envelope = (t: number, strength: number) => {
        const syll = Math.max(0, Math.sin(t * 2 * Math.PI * 4.6 + phase)) ** 0.7
        const phrase = 0.55 + 0.45 * Math.sin(t * 2 * Math.PI * 0.8 + phase * 2)
        return Math.min(1, (0.18 + 0.62 * syll * phrase + Math.random() * 0.08) * strength)
      }
      return {
        levels: () => {
          const t = performance.now() / 1000
          return {
            agent: speaking === 'agent' ? envelope(t, 1) : 0,
            user: speaking === 'user' && !muted ? envelope(t + 0.3, 0.85) : 0,
          }
        },
        setMuted: (m) => {
          muted = m
        },
        end: () => {
          ending = true
        },
        close: () => {
          closed = true
          h.onClose?.()
        },
      }
    },
  }
}
