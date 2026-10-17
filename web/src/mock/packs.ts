// Demo-pack data for mock mode. Images + layout.json live in /public/mock/<id>/.
// layout.json was produced by replaying data/generate_packs.py's placeholder renderer,
// so every bbox lands exactly on the handwriting in the page photo.
import type { BBox, DemoPack, Lang, Market } from '../api/types'

export interface LayoutEntry {
  page: number
  line: number
  date: string
  description: string
  amount_in: number
  amount_out: number
  bbox: BBox
  row_bbox: BBox
}

export interface LayoutDay {
  date: string
  transactions: number
  total: number
  bbox: BBox
  amount_bbox: BBox
}

export interface PackLayout {
  meta: {
    id: string
    label: DemoPack['label']
    persona: string
    business: string
    city: string
    market: Market
    language: string
    currency: 'Rp' | '₹'
    rail: string
    hero: boolean
    note: string
    period_start: string
    days: number
  }
  entries: LayoutEntry[]
  statement: LayoutDay[]
  images: Record<'page1' | 'page2' | 'statement', [number, number]>
}

export const MOCK_PACKS: DemoPack[] = [
  { id: 'sari', persona: { name: 'Ibu Sari Wulandari', business: 'Warung sembako', city: 'Yogyakarta' }, market: 'ID', language: 'id', label: 'genuine', hero: true, has_photos: false },
  { id: 'murugan', persona: { name: 'Murugan Selvaraj', business: 'Kirana store', city: 'Madurai' }, market: 'IN', language: 'ta', label: 'genuine', hero: true, has_photos: false },
  { id: 'rina', persona: { name: 'Ibu Rina Kartika', business: 'Warung (claimed)', city: 'Bantul' }, market: 'ID', language: 'id', label: 'fabricated', hero: false, has_photos: false },
  { id: 'joko', persona: { name: 'Pak Joko Santoso', business: 'Kios kelontong', city: 'Klaten' }, market: 'ID', language: 'id', label: 'genuine', hero: false, has_photos: false },
  { id: 'lakshmi', persona: { name: 'Lakshmi Narayanan', business: 'Tiffin & provisions', city: 'Coimbatore' }, market: 'IN', language: 'ta', label: 'genuine', hero: false, has_photos: false },
  { id: 'dewi', persona: { name: 'Ibu Dewi Lestari', business: 'Warung makan', city: 'Sleman' }, market: 'ID', language: 'id', label: 'inflated', hero: false, has_photos: false },
  { id: 'selvam', persona: { name: 'Selvam Pandian', business: 'Provision store', city: 'Tiruchirappalli' }, market: 'IN', language: 'ta', label: 'inflated', hero: false, has_photos: false },
  { id: 'karthik', persona: { name: 'Karthik Raman', business: 'Store (claimed)', city: 'Salem' }, market: 'IN', language: 'ta', label: 'fabricated', hero: false, has_photos: false },
]

const cache = new Map<string, Promise<PackLayout>>()

export function loadLayout(packId: string): Promise<PackLayout> {
  let p = cache.get(packId)
  if (!p) {
    p = fetch(`/mock/${packId}/layout.json`).then((r) => {
      if (!r.ok) throw new Error(`Unknown demo pack ${packId}`)
      return r.json() as Promise<PackLayout>
    })
    cache.set(packId, p)
  }
  return p
}

export function packLang(packId: string): Lang {
  return MOCK_PACKS.find((p) => p.id === packId)?.language ?? 'en'
}
