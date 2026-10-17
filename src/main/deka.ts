import type { AnalysisProduct, Breakdown, BreakdownRow, ProductSearchResponse } from '../shared/analysis'
import { isValidIsin, validateBreakdown } from '../shared/analysis'

const ROOT = 'https://www.deka-etf.de'
export function decodeHtml(text: string): string {
  return text.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
}
function plain(text: string): string { return decodeHtml(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() }
async function getText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'FinanzApp/0.2 (personal portfolio analysis)', Accept: 'text/html,application/json' } })
  if (!response.ok) throw new Error(`Anbieter antwortet mit HTTP ${response.status}`)
  const text = await response.text()
  if (text.length > 8_000_000) throw new Error('Anbieterantwort zu groß.')
  return text
}
export function parseDekaCatalog(html: string): AnalysisProduct[] {
  const products = new Map<string, AnalysisProduct>()
  for (const match of html.matchAll(/<a\b[^>]*href="(\/etfs\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const isin = match[2].match(/\b(DE[A-Z0-9]{10})\b/)?.[1]
    const name = match[2].match(/<span[^>]*>(Deka[\s\S]*?)<\/span>/)?.[1]
    if (!isin || !name || !isValidIsin(isin)) continue
    products.set(isin, { id: isin, isin, name: plain(name), kind: 'etf', provider: 'deka-etf', providerPath: match[1], currency: 'EUR', basis: 'holdings', breakdowns: {} })
  }
  return [...products.values()]
}
function numeric(text: string): number { return Number(text.replace(/%|\s/g, '').replace(/\./g, '').replace(',', '.')) }
export function parseDekaComposition(html: string, product: AnalysisProduct): AnalysisProduct {
  const asOf = html.match(/<input\b[^>]*type="date"[^>]*value="(\d{4}-\d{2}-\d{2})"/)?.[1]
  const fund = html.split('id="composition-fund"')[1]?.split('id="composition-index"')[0]
  if (!asOf || !fund) throw new Error('Die Zusammensetzung hat ein unbekanntes Format. Vorhandene Angaben bleiben erhalten.')
  const rows: BreakdownRow[] = []
  for (const row of fund.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => plain(c[1]))
    if (cells.length === 4 && isValidIsin(cells[2]) && cells[3].includes('%')) rows.push({ name: cells[0], isin: cells[2], weight: numeric(cells[3]) })
  }
  if (!rows.length) throw new Error('Der Anbieter liefert momentan keine auslesbaren Positionen.')
  // This page also contains index holdings. Restrict strictly to the fund section.
  const breakdown = (items: BreakdownRow[]): Breakdown => ({ rows: items, asOf, source: 'Deka Investment – Fondszusammensetzung', sourceUrl: ROOT + product.providerPath, manual: false })
  const chart = (tag: string): BreakdownRow[] => {
    const raw = fund.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]
    if (!raw) return []
    const data = JSON.parse(decodeHtml(raw))?.series?.[0]?.data
    if (!Array.isArray(data)) return []
    return data.map((r: { name: string; y: number }) => ({ name: r.name, weight: r.y }))
  }
  const holdings = breakdown(rows)
  const countries = breakdown(chart('knm-map-world'))
  const sectors = breakdown(chart('knm-chart-pie'))
  const breakdowns: AnalysisProduct['breakdowns'] = {}
  for (const [key, value] of Object.entries({ holdings, countries, sectors })) {
    if (!value.rows.length) continue
    const error = validateBreakdown(value)
    if (error) throw new Error(`Anbieterdaten nicht übernommen: ${error}`)
    breakdowns[key as 'holdings' | 'countries' | 'sectors'] = value
  }
  return { ...product, breakdowns, notes: 'Deka veröffentlicht die Zusammensetzung zum Ende des Vormonats. Kleine Differenzen können aus Rundung, Kasse und sonstigen Forderungen entstehen. Länder und Branchen sind separate Anbieteraufteilungen; keine Zuordnung aus ISIN-Länderkürzeln.' }
}

const unionSource = { asOf: '2026-08-31', source: 'Union Investment – Produktinformation vom 04.09.2026', sourceUrl: 'https://cdn.dam.union-investment.de/720581_UniCommodities.pdf', manual: false }
const union: AnalysisProduct = {
  id: 'LU0249045476', isin: 'LU0249045476', name: 'UniCommodities', kind: 'commodity', provider: 'union-snapshot', currency: 'EUR', basis: 'exposure',
  notes: 'Dokumentierter Datenstand, kein Live-Abruf. Wirtschaftliches Rohstoffengagement; keine direkten Aktienbestände. Restanteile bleiben unbekannt. Länderaufteilung hierfür nicht anwendbar.',
  breakdowns: {
    holdings: { ...unionSource, rows: [['Benzin',10.08],['Kupfer',9.52],['Silber',8.72],['Gas-Öl',8.66],['Gold',8.53],['Platin',8.30],['Palladium',8.10],['Blei',7.55],['Öl-Brent',6.84],['Nickel',5.93]].map(([name, weight]) => ({ name: String(name), weight: Number(weight) })) },
    sectors: { ...unionSource, rows: [{name:'Energie',weight:33.82},{name:'Edelmetalle',weight:33.64},{name:'Industriemetalle',weight:31.19}] }
  }
}
let catalogCache: { data: AnalysisProduct[]; time: number } | undefined
export function parseDekaFund(html: string, isin: string): AnalysisProduct | null {
  const title = plain(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '')
  if (!title.includes(isin) || !title.includes('|')) return null
  const name = title.split('|')[0].trim()
  const product: AnalysisProduct = { id: isin, isin, name, kind: 'fund', provider: 'deka-fund', currency: 'EUR', basis: 'holdings', breakdowns: {}, notes: 'Auszug aus dem offiziellen Fondsprofil, keine vollständige Bestandsliste. Währung vor der Bestandserfassung prüfen. Einzelanlagen ohne ISIN können nicht zuverlässig mit anders benannten Positionen zusammengeführt werden.' }
  for (const section of html.matchAll(/<SingleAccordion\b[^>]*accordion-headline="([^"]+)"[^>]*>([\s\S]*?)<\/SingleAccordion>/gi)) {
    const dimension = /Top-Werte/i.test(section[1]) ? 'holdings' : /Branchen/i.test(section[1]) ? 'sectors' : /Länder/i.test(section[1]) ? 'countries' : null
    const date = section[2].match(/Stand:\s*(\d{2})\.(\d{2})\.(\d{4})/)
    if (!dimension || !date) continue
    const rows: BreakdownRow[] = []
    if (dimension === 'holdings') {
      for (const match of section[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
        const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(c => plain(c[1]))
        if (cells.length >= 2 && cells[0] && /^\d+(?:,\d+)?$/.test(cells[cells.length-1])) rows.push({name:cells[0],weight:numeric(cells[cells.length-1])})
      }
    } else {
      const decoded = decodeHtml(section[2])
      for (const match of decoded.matchAll(/title:\s*"([^"]+)"\s*,\s*value:\s*"([\d.]+)"/g)) rows.push({name:match[1],weight:Number(match[2])})
    }
    if (rows.length) {
      const data: Breakdown = { rows, asOf:`${date[3]}-${date[2]}-${date[1]}`, source:'Deka – Fondsprofil (veröffentlichter Auszug)',sourceUrl:`https://www.deka.de/privatkunden-legacy/fondsprofil?fl=1&id=${isin}`,manual:false }
      if (!validateBreakdown(data)) product.breakdowns[dimension] = data
    }
  }
  return product
}
async function catalog(): Promise<AnalysisProduct[]> {
  if (catalogCache && Date.now() - catalogCache.time < 24 * 3600_000) return catalogCache.data
  const data = parseDekaCatalog(await getText(ROOT + '/etfs'))
  if (!data.length) throw new Error('Deka-Produktliste derzeit nicht verfügbar.')
  catalogCache = { data, time: Date.now() }
  return data
}
export async function searchProducts(query: string): Promise<ProductSearchResponse> {
  query = query.trim().slice(0, 100)
  if (query.length < 2) return { products: [], warnings: [] }
  const warnings: string[] = []
  const normalized = query.toLocaleLowerCase()
  const exactIsin = /^[A-Z]{2}[A-Z0-9]{10}$/i.test(query)
  if (exactIsin && !isValidIsin(query.toUpperCase())) return { products: [], warnings: ['Die ISIN-Prüfziffer ist ungültig. Bitte die Eingabe prüfen.'] }
  const [deka, yahoo, fund] = await Promise.allSettled([
    catalog(),
    getText(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`).then(JSON.parse),
    exactIsin ? getText(`https://www.deka.de/privatkunden-legacy/fondsprofil?fl=1&id=${query.toUpperCase()}`).then(html => parseDekaFund(html, query.toUpperCase())) : Promise.resolve(null)
  ])
  const products: AnalysisProduct[] = []
  if ([union.isin, union.name, 'Union Investment'].join(' ').toLowerCase().includes(normalized)) products.push(union)
  if (deka.status === 'fulfilled') products.push(...deka.value.filter(p => exactIsin ? p.isin === query.toUpperCase() : normalized.split(/\s+/).every(term => (p.name + ' ' + p.isin).toLowerCase().includes(term))))
  else warnings.push('Deka-ETF-Suche vorübergehend nicht erreichbar.')
  if (fund.status === 'fulfilled' && fund.value && !products.some(p => p.id === fund.value!.id)) products.push(fund.value)
  if (yahoo.status === 'fulfilled' && Array.isArray(yahoo.value.quotes)) {
    for (const q of yahoo.value.quotes) {
      if (typeof q.symbol !== 'string' || !['ETF','MUTUALFUND','EQUITY'].includes(q.quoteType)) continue
      // An ISIN search must never silently associate a fuzzy match with that ISIN.
      products.push({ id: 'ticker:' + q.symbol, ticker: q.symbol, name: q.longname || q.shortname || q.symbol, kind: q.quoteType === 'ETF' ? 'etf' : q.quoteType === 'EQUITY' ? 'stock' : 'fund', provider: 'yahoo', currency: '', basis: 'holdings', breakdowns: {}, notes: 'Yahoo-Suchtreffer. ISIN und Handelswährung vor dem Übernehmen prüfen. Fondsbestandteile bei diesem Anbieter manuell ergänzen.' })
    }
  } else warnings.push('Die ergänzende Yahoo-Suche ist derzeit nicht verfügbar. Deka-ETFs und lokale Produkte bleiben durchsuchbar.')
  if (exactIsin && products.some(p => !p.isin)) warnings.push('Treffer ohne bestätigte ISIN sind nur Vorschläge, keine bestätigte Zuordnung.')
  return { products: products.slice(0, 40), warnings }
}
export async function loadProduct(product: AnalysisProduct): Promise<AnalysisProduct> {
  if (product.provider === 'union-snapshot' && product.isin === union.isin) return union
  if (product.provider === 'deka-fund' && product.isin && isValidIsin(product.isin)) {
    const result = parseDekaFund(await getText(`https://www.deka.de/privatkunden-legacy/fondsprofil?fl=1&id=${product.isin}`),product.isin)
    if (!result) throw new Error('Deka-Fondsprofil momentan nicht verfügbar.')
    return result
  }
  if (product.provider !== 'deka-etf') return product
  // Resolve paths server-side rather than fetching a renderer-supplied URL.
  const official = (await catalog()).find(p => p.isin === product.isin)
  if (!official) throw new Error('ISIN nicht im Deka-ETF-Verzeichnis gefunden.')
  return parseDekaComposition(await getText(ROOT + official.providerPath + '/composition_data'), official)
}
