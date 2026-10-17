import type { Lang } from '../api/types'

export function defaultLang(): Lang {
  try {
    const l = localStorage.getItem('bukti.lang.default')
    if (l === 'id' || l === 'ta' || l === 'en') return l
  } catch {
    /* private mode */
  }
  return 'id'
}

export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}
