import {validProductUrl} from './links'
import { isValidIsin, validateBreakdown } from './analysis'
import { marketValue, type State } from './model'
export function validateState(input:unknown): asserts input is State {
  const state=input as State
  if(!state||state.version!==1||!Array.isArray(state.entries)||state.entries.length>500)throw new Error('Ungültige Fondsblick-Datei.')
  const ids=new Set<string>()
  for(const e of state.entries){
    const p=e?.product
    if(!p||typeof p.name!=='string'||!p.name.trim()||!p.isin||!isValidIsin(p.isin)||p.id!==p.isin||ids.has(p.id)||!p.breakdowns||!['etf','fund','stock','commodity','structured','other'].includes(p.kind))throw new Error('Ungültiges oder doppeltes Produkt in der Datei.')
    if((p.productUrl!==undefined&&!validProductUrl(p.productUrl))||(p.personalUrl!==undefined&&!validProductUrl(p.personalUrl)))throw new Error('Ungültiger Produktlink: HTTPS-Adresse erforderlich.')
    ids.add(p.id)
    for(const data of Object.values(p.breakdowns)){if(!data)continue;if(!Array.isArray(data.rows)||data.rows.length>20000||typeof data.asOf!=='string'||typeof data.source!=='string'||data.rows.some(r=>typeof r.name!=='string'))throw new Error('Ungültige Aufteilung.');const error=validateBreakdown(data);if(error)throw new Error(error)}
    if(e.investment&&(!['value','units'].includes(e.investment.mode)||!Number.isFinite(marketValue(e.investment))||marketValue(e.investment)<=0||!Number.isFinite(e.investment.quantity)||!Number.isFinite(e.investment.priceEUR)||e.investment.quantity<0||e.investment.priceEUR<0||typeof e.investment.asOf!=='string'))throw new Error('Ungültiger Portfoliobestand.')
  }
}
