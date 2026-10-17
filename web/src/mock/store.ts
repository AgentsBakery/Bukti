// In-memory application store for mock mode, mirrored to localStorage so a console
// opened in another tab (or a page reload) sees the same applications.
import type { Application } from '../api/types'

const KEY = 'bukti.mock.apps.v2'

let mem: Record<string, Application> = load()

function load(): Record<string, Application> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, Application>) : {}
  } catch {
    return {}
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem))
  } catch {
    // Quota (large uploaded photos): keep working in memory only.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) mem = load()
  })
}

const clone = <T>(v: T): T => structuredClone(v)

export const store = {
  get(id: string): Application | undefined {
    const a = mem[id]
    return a ? clone(a) : undefined
  },
  put(app: Application) {
    mem[app.id] = clone(app)
    persist()
  },
  update(id: string, fn: (app: Application) => void): Application {
    const a = mem[id]
    if (!a) throw new Error(`Application ${id} not found`)
    fn(a)
    persist()
    return clone(a)
  },
  list(): Application[] {
    return Object.values(mem).map(clone)
  },
  remove(id: string) {
    delete mem[id]
    persist()
  },
}
