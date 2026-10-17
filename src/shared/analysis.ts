export type Dimension = 'holdings' | 'countries' | 'sectors' | 'themes'
export type ProductKind = 'fund' | 'etf' | 'stock' | 'commodity' | 'structured' | 'other'
export interface BreakdownRow { name: string; weight: number; isin?: string }
export interface Breakdown {
  rows: BreakdownRow[]
  asOf: string
  source: string
  sourceUrl?: string
  manual: boolean
}
export interface AnalysisProduct {
  id: string
  name: string
  isin?: string
  ticker?: string
  kind: ProductKind
  provider: 'deka-certificate' | 'deka-etf' | 'deka-fund' | 'yahoo' | 'manual' | 'union-snapshot'
  providerPath?: string
  currency: string
  price?: number
  priceAsOf?: string
  basis: 'holdings' | 'exposure'
  notes?: string
  breakdowns: Partial<Record<Dimension, Breakdown>>
}
export interface ProductSearchResponse { products: AnalysisProduct[]; warnings: string[] }
export const DIMENSIONS: Record<Dimension, string> = {
  holdings: 'Einzelanlagen', countries: 'Länder', sectors: 'Branchen / Bereiche', themes: 'Themen'
}
export const PRODUCT_KINDS: Record<ProductKind, string> = {
  fund: 'Fonds', etf: 'ETF', stock: 'Aktie', commodity: 'Rohstofffonds', structured: 'Zertifikat / strukturierte Anlage', other: 'Sonstiges'
}
export function isValidIsin(value: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value)) return false
  const digits = [...value].map(c => parseInt(c, 36).toString()).join('')
  return [...digits].reverse().reduce((sum, c, i) => { const n = Number(c) * (i % 2 ? 2 : 1); return sum + (n > 9 ? n - 9 : n) }, 0) % 10 === 0
}
export function validateBreakdown(data: Breakdown): string | null {
  if (!data.source.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(data.asOf) || (!Number.isFinite(Date.parse(data.asOf)) || new Date(data.asOf).toISOString().slice(0,10)!==data.asOf)) return 'Bitte Quelle und einen gültigen Datenstand angeben.'
  if (data.asOf > new Date().toISOString().slice(0, 10)) return 'Der Datenstand darf nicht in der Zukunft liegen.'
  if (!data.rows.length) return 'Bitte mindestens einen Bestandteil ergänzen.'
  if (data.rows.some(r => !r.name.trim() || !Number.isFinite(r.weight) || r.weight < 0 || r.weight > 100 || (r.isin && !isValidIsin(r.isin)))) return 'Jede Zeile braucht einen Namen, einen Anteil zwischen 0 und 100 % und gegebenenfalls eine gültige ISIN.'
  const ids = data.rows.map(r => r.isin || r.name.trim().toLocaleLowerCase())
  if (new Set(ids).size !== ids.length) return 'Doppelte Bestandteile bitte in einer Zeile zusammenfassen.'
  if (data.rows.reduce((sum, r) => sum + r.weight, 0) > 100.5) return 'Die Summe liegt über 100 %. Überlappende Themen und gehebelte Engagements lassen sich in dieser Ansicht nicht als Verteilung speichern.'
  return null
}
