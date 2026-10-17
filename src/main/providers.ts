import {withProductLink} from '../shared/links'
import {lookupCertificate} from './certificates'
import { loadAmundi, loadHSBC } from './issuerProviders'
import { parseDekaCatalog, parseDekaComposition, parseDekaFund, decodeHtml, loadProduct } from './deka'
import { isValidIsin, validateBreakdown, type AnalysisProduct, type Breakdown, type BreakdownRow } from '../shared/analysis'
import type { Lookup, Product } from '../shared/model'
const clean=(s:string)=>decodeHtml(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()
export async function getText(url:string):Promise<string>{
  const response=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Mozilla/5.0 Fondsblick/1.0','x-application-id':'pp-ui-csr'}})
  if(!response.ok)throw new Error(`Quelle antwortet mit ${response.status}`)
  const text=await response.text();if(text.length>10_000_000)throw new Error('Antwort zu groß');return text
}
export function parseJustETF(html:string,isin:string):AnalysisProduct|null {
  const title=clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'')
  if(!title.includes(isin)||!title.includes('|'))return null
  const name=title.split('|')[0].trim()
  if(!name)return null
  const p:AnalysisProduct={id:isin,isin,name,kind:'etf',provider:'manual',currency:'EUR',basis:'holdings',breakdowns:{},notes:'Veröffentlichter Auszug von justETF. Restliche Positionen und zusammengefasste Länder bleiben als nicht aufgeschlüsselt sichtbar.'}
  const date=html.match(/data-testid="tl_etf-holdings_reference-date"[^>]*>\s*Stand:\s*(\d{2})\.(\d{2})\.(\d{4})/)
  if(!date)return p
  for(const [type,dimension] of [['top-holdings','holdings'],['countries','countries']] as const){
    const rows:BreakdownRow[]=[]
    for(const match of html.matchAll(new RegExp(`<tr[^>]*data-testid="etf-holdings_${type}_row"[^>]*>([\\s\\S]*?)<\\/tr>`,'g'))){
      const row=match[1]
      const label=row.match(new RegExp(`data-testid="tl_etf-holdings_${type}_(?:link|value)_name"[^>]*>([\\s\\S]*?)<\\/(?:a|td)>`))?.[1]
      const weight=row.match(new RegExp(`data-testid="tl_etf-holdings_${type}_value_percentage"[^>]*>([\\s\\S]*?)<\\/span>`))?.[1]
      const underlying=row.match(/\/stock-profiles\/([A-Z0-9]{12})/)?.[1]
      if(label&&weight)rows.push({name:clean(label),weight:Number(clean(weight).replace('%','').replace(',','.')),isin:underlying&&isValidIsin(underlying)?underlying:undefined})
    }
    const breakdown:Breakdown={rows,asOf:`${date[3]}-${date[2]}-${date[1]}`,source:'justETF · veröffentlichte Zusammensetzung',sourceUrl:`https://www.justetf.com/de/etf-profile.html?isin=${isin}`,manual:false}
    if(rows.length&&!validateBreakdown(breakdown))p.breakdowns[dimension]=breakdown
  }
  if(/data-testid="etf-profile-header_replication-value"[^>]*>\s*Synthetisch/i.test(html)){p.basis='exposure';p.notes+=' Synthetische Replikation: Aufteilung des Engagements, nicht zwingend der gehaltenen Sicherheiten.'}
  return p
}
let dekaCache:AnalysisProduct[]|undefined
const verified=(p:AnalysisProduct,source:string):Product=>withProductLink({...p,id:p.isin!,verified:true,checkedAt:new Date().toISOString(),identitySource:source})
export function parseIshares(data:any,p:AnalysisProduct,sourceUrl:string,productId:string):AnalysisProduct{
  if(String(data.productId)!==productId)throw new Error('Abweichendes Produkt in der Anbieterantwort.')
  const columns=data.componentsByNameMap?.holdings?.containersByNameMap?.all?.dataPointsByNameMap
  const names=columns?.issueName?.value,weights=columns?.holdingPercent?.value,ids=columns?.isin?.value,classes=columns?.assetClass?.value,country=columns?.countryOfRisk?.value
  const date=String(columns?.asOfDate?.value||'')
  if(!Array.isArray(names)||![weights,ids,classes,country].every(a=>Array.isArray(a)&&a.length===names.length)||!/^\d{8}$/.test(date))throw new Error('Zusammensetzung hat ein unbekanntes Format.')
  const rows=new Map<string,BreakdownRow>(),countries=new Map<string,number>()
  for(let i=0;i<names.length;i++){
    if(!['Aktien','Equity'].includes(classes[i])||!Number.isFinite(weights[i])||weights[i]<=0)continue
    const isin=isValidIsin(ids[i]||'')?ids[i]:undefined
    const key=isin||names[i]
    rows.set(key,{name:names[i],isin,weight:(rows.get(key)?.weight||0)+weights[i]})
    if(country[i]&&country[i]!=='-')countries.set(country[i],(countries.get(country[i])||0)+weights[i])
  }
  const meta={asOf:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`,source:'iShares / BlackRock · veröffentlichte Aktienbestände',sourceUrl,manual:false}
  const holdings={...meta,rows:[...rows.values()]},countryData={...meta,rows:[...countries].map(([name,weight])=>({name,weight}))}
  if(!holdings.rows.length||validateBreakdown(holdings)||validateBreakdown(countryData))throw new Error('Anbieteraufteilung konnte nicht validiert werden.')
  return {...p,breakdowns:{...p.breakdowns,holdings,countries:countryData},notes:'Aktienbestände direkt von iShares / BlackRock. Länder nach dem vom Anbieter zugeordneten Risikoland; keine Umsatzverteilung. Liquidität, Derivate und sonstige Restanteile bleiben unaufgeschlüsselt.'}
}
async function enrichIshares(p:AnalysisProduct,html:string):Promise<AnalysisProduct>{
  const link=[...html.matchAll(/href="([^"]*ishares\.com[^"]*)"/g)].map(m=>decodeHtml(m[1])).find(url=>/^https:\/\/www\.ishares\.com\/de\/privatanleger\/de\/produkte\/\d+\//.test(url))
  if(!link)return p
  const url=new URL(link);url.search=''
  const official=await getText(url.href)
  if(!clean(official).includes(p.isin!))throw new Error('ISIN nicht auf der Anbieterseite bestätigt.')
  const properties=[...official.matchAll(/componentprops="([^"]*)"/g)].map(m=>{try{return JSON.parse(decodeHtml(m[1]))}catch{return null}}).find(d=>d?.componentId==='holdings'&&d.context&&d.initAsOfDates?.all)
  if(!properties)throw new Error('Keine aktuelle Bestandsliste verfügbar.')
  const c=properties.context
  const params=new URLSearchParams({appSubType:'ISHARES',appType:'PRODUCT_PAGE',component:'holdings.all',locale:'de_DE',portfolioId:String(c.productId),targetSite:'de-ishares-v2',userType:'individual',excludeContent:'true',asOfDate:String(properties.initAsOfDates.all),includeConfig:'true'})
  const data=JSON.parse(await getText('https://www.ishares.com/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data?'+params))
  return parseIshares(data,p,url.href,String(c.productId))
}
export async function lookupISIN(raw:string):Promise<Lookup>{
  const isin=raw.replace(/\s/g,'').toUpperCase()
  if(!isValidIsin(isin))return {status:'not-found',message:'Bitte eine gültige ISIN mit 12 Zeichen eingeben. Die Prüfziffer stimmt nicht.'}
  if(isin==='LU0249045476'){
    const p=await loadProduct({isin,id:isin,provider:'union-snapshot'} as AnalysisProduct)
    return {status:'found',product:verified(p,'Union Investment · Produktinformation'),message:'Produkt bestätigt. Dokumentierter Stand vom 31.08.2026; Rohstofffonds, kein Aktienfonds.'}
  }
  const [deka,profile,etf,certificate]=await Promise.allSettled([
    (async()=>{dekaCache??=parseDekaCatalog(await getText('https://www.deka-etf.de/etfs'));const p=dekaCache.find(p=>p.isin===isin);if(!p)return null;try{return parseDekaComposition(await getText('https://www.deka-etf.de'+p.providerPath+'/composition_data'),p)}catch{return {...p,notes:'Produkt bestätigt, Zusammensetzung momentan nicht abrufbar.'}}})(),
    getText(`https://www.deka.de/privatkunden-legacy/fondsprofil?fl=1&id=${isin}`).then(html=>parseDekaFund(html,isin)),
    getText(`https://www.justetf.com/de/etf-profile.html?isin=${isin}`).then(html=>({p:parseJustETF(html,isin),html})),
    isin.startsWith('DE')?lookupCertificate(isin):Promise.resolve(null)
  ])
  if(certificate.status==='fulfilled'&&certificate.value)return {status:'found',product:withProductLink(certificate.value),message:'ISIN im offiziellen Deka-Zertifikatsprofil bestätigt. Kurse sind Momentaufnahmen mit ausgewiesenem Stand.'}
  if(deka.status==='fulfilled'&&deka.value)return {status:'found',product:verified(deka.value,'Deka Investment'),message:'ISIN im offiziellen Deka-Verzeichnis bestätigt.'}
  if(profile.status==='fulfilled'&&profile.value)return {status:'found',product:verified(profile.value,'Deka · offizielles Fondsprofil'),message:'ISIN im offiziellen Deka-Fondsprofil bestätigt.'}
  if(etf.status==='fulfilled'&&etf.value.p){
    let p=etf.value.p
    try{if(/^Amundi /i.test(p.name))p=await loadAmundi(p);else if(/^HSBC /i.test(p.name))p=await loadHSBC(p);else p=await enrichIshares(p,etf.value.html)}catch{p={...p,notes:(p.notes||'')+' Die vollständige Anbieterliste konnte bei diesem Abruf nicht bestätigt werden.'}}
    return {status:'found',product:verified(p,'justETF · Produktprofil'),message:'ISIN im ETF-Verzeichnis bestätigt.'}
  }
  const unavailable=[deka,profile,etf].some(p=>p.status==='rejected')
  return {status:unavailable?'unavailable':'not-found',message:unavailable?'Das Produkt konnte nicht bestätigt werden; mindestens eine Datenquelle ist momentan nicht erreichbar. Erneut versuchen oder ausdrücklich manuell anlegen.':'In den angebundenen Verzeichnissen wurde kein bestätigter Treffer gefunden. Das bedeutet nicht, dass das Produkt nicht existiert. Du kannst es manuell anlegen.'}
}
