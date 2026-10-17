// Picks the transport once at startup. VITE_MOCK=1 swaps in the in-browser mock; the
// condition is a build-time constant, so real builds tree-shake the mock away.
import type { BuktiApi } from './client'
import { createHttpApi } from './http'

export const IS_MOCK = import.meta.env.VITE_MOCK === '1'

export const api: BuktiApi = IS_MOCK ? (await import('../mock')).createMockApi() : createHttpApi()

export * from './client'
export * from './types'
