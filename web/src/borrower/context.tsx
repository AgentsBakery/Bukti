import { createContext, useContext } from 'react'
import type { Application, Lang } from '../api/types'
import { translate, type StringKey } from '../i18n/strings'
import { shortName } from '../lib/format'

export type Step = 'foto' | 'cerita' | 'hasil'

export interface BorrowerCtx {
  app: Application
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: StringKey, vars?: Record<string, string | number>) => string
  rail: 'QRIS' | 'UPI'
  refresh: () => Promise<Application | null>
  replace: (a: Application) => void
  goto: (s: Step) => void
  portal: HTMLElement | null
  embedded: boolean
}

export const Ctx = createContext<BorrowerCtx | null>(null)

export function useBorrower(): BorrowerCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useBorrower outside BorrowerApp')
  return c
}

export function honorific(app: Application): string {
  const first = app.persona.name.split(/\s+/)[0].toLowerCase()
  if (first === 'ibu' || first === 'bu') return 'Ibu'
  if (first === 'pak' || first === 'bapak') return 'Bapak'
  return 'Anda'
}

export function makeT(app: Application, lang: Lang) {
  const rail = app.market === 'ID' ? 'QRIS' : 'UPI'
  const base = { h: honorific(app), rail, name: shortName(app.persona) }
  return (key: StringKey, vars: Record<string, string | number> = {}) => translate(lang, key, { ...base, ...vars })
}
