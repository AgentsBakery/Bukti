import type { Persona } from '../api/types'

/** "Warung (claimed)" → "Warung". Plain string search: no regex backtracking. */
export function businessName(persona: Persona): string {
  const b = persona.business
  const i = b.toLowerCase().indexOf('(claimed)')
  return (i >= 0 ? b.slice(0, i) + b.slice(i + '(claimed)'.length) : b).trim()
}
