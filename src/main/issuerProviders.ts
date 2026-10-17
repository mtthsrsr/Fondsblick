import * as XLSX from 'xlsx'
import { isValidIsin, validateBreakdown, type AnalysisProduct, type BreakdownRow } from '../shared/analysis'

const headers={'User-Agent':'Mozilla/5.0 Fondsblick/1.1'}
async function response(url:string,init:RequestInit={}) {const r=await fetch(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`Anbieter antwortet mit ${r.status}`);const b=await r.arrayBuffer();if(b.byteLength>15_000_000)throw new Error('Anbieterdatei zu groß');return Buffer.from(b)}
const combine=(rows:BreakdownRow[])=>{const out=new Map<string,BreakdownRow>();for(const r of rows){const key=r.isin||r.name.toLowerCase();out.set(key,{...r,weight:(out.get(key)?.weight||0)+r.weight})}return [...out.values()]}
function finish(p:AnalysisProduct,rows:BreakdownRow[],countries:BreakdownRow[],asOf:string,source:string,sourceUrl:string,notes:string){const meta={asOf,source,sourceUrl,manual:false};const holdings={...meta,rows:combine(rows)},countryData={...meta,rows:combine(countries)};const error=validateBreakdown(holdings)||validateBreakdown(countryData);if(error)throw new Error(error);return {...p,breakdowns:{...p.breakdowns,holdings,countries:countryData},notes}}

export function parseAmundi(data:any,p:AnalysisProduct):AnalysisProduct {
 const product=data?.products?.find((r:any)=>r.productId===p.isin&&r.characteristics?.ISIN===p.isin)
 if(!product)throw new Error('Amundi-Antwort gehört nicht zur gesuchten ISIN.')
 if(product.characteristics.FUND_REPLICATION_METHODOLOGY!=='Direct(Physical)')throw new Error('Synthetischer Fonds: Sicherheiten werden nicht als Indexanlagen übernommen.')
 const raw=product.composition?.compositionData
 if(!Array.isArray(raw)||!raw.length||raw.length!==product.composition.totalNumberOfInstruments)throw new Error('Unvollständige Amundi-Bestandsliste.')
 const asOf=product.characteristics.POSITION_AS_OF_DATE
 const rows:BreakdownRow[]=[],countries:BreakdownRow[]=[];let others=0,total=0
 for(const entry of raw){const r=entry.compositionCharacteristics;if(!r||r.date!==asOf||typeof r.weight!=='number'||!Number.isFinite(r.weight))throw new Error('Ungültiger Datenstand oder Anteil.');const weight=r.weight*100;total+=weight
  if(['EQUITY_ORDINARY','PREFERENCE_SHARES','DEPOSITORY_RECEIPT','WARRANT','RIGHT'].includes(r.type)&&weight>=0){if(weight===0)continue;rows.push({name:r.name,isin:isValidIsin(r.isin||'')?r.isin:undefined,weight});if(r.countryOfRisk)countries.push({name:r.countryOfRisk,weight})}else others+=weight
 }
 if(Math.abs(total-100)>.5||others<-.01)throw new Error('Bestandsliste lässt sich nicht als ungehebelte Verteilung darstellen.')
 if(others>0)rows.push({name:'Liquidität & Derivate (netto)',weight:others})
 return finish(p,rows,countries,asOf,'Amundi · vollständige Bestandsliste',`https://www.amundietf.de/de/privatanleger/products/equity/${p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}/${p.isin!.toLowerCase()}`,'Vollständige veröffentlichte Bestandsliste von Amundi. Einzelwerte nach ISIN; Liquidität und Derivate netto zusammengefasst. Länder nach Risikoland des Wertpapiers. Für Liquidität und Derivate wird kein Aktienland erfunden.')
}
export async function loadAmundi(p:AnalysisProduct){const body={productIds:[p.isin],context:{countryCode:'DEU',languageCode:'de',languageName:'German',userProfileName:'RETAIL'},characteristics:['ISIN','SHARE_MARKETING_NAME','FUND_REPLICATION_METHODOLOGY','POSITION_AS_OF_DATE'],composition:{compositionFields:['date','type','isin','name','weight','countryOfRisk']},metrics:[],historics:[]};return parseAmundi(JSON.parse((await response('https://www.amundietf.de/mapi/ProductAPI/getProductsData',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).toString()),p)}

export function readSheets(buffer:Buffer){if(buffer.length>15_000_000)throw new Error('Datei zu groß (maximal 15 MB).');const workbook=XLSX.read(buffer,{type:'buffer',cellFormula:false,cellHTML:false,sheetRows:20050,raw:true});if(workbook.SheetNames.length>30)throw new Error('Zu viele Tabellenblätter.');return workbook.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[name],{header:1,defval:'',raw:false}).map(row=>row.map(v=>String(v??'')))}))}
export function parseHSBC(buffer:Buffer,p:AnalysisProduct):AnalysisProduct {
 const book=XLSX.read(buffer,{type:'buffer',cellFormula:false,cellHTML:false,sheetRows:20050});let table:any[][]|undefined
 for(const name of book.SheetNames){const rows=XLSX.utils.sheet_to_json<any[]>(book.Sheets[name],{header:1,defval:''});if(rows.some(r=>r.includes('SecurityName')&&r.includes('Weighting')))table=rows}
 if(!table)throw new Error('Unbekanntes HSBC-Listenformat.')
 const fundName=String(table.find(r=>r[0]==='Name')?.[1]||'');const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');if(!fundName||!norm(p.name).startsWith(norm(fundName)))throw new Error('HSBC-Bestandsliste gehört zu einem anderen Fonds.')
 const serial=table.find(r=>r[0]==='Date')?.[1];if(typeof serial!=='number')throw new Error('Kein eindeutiger HSBC-Datenstand.');const d=XLSX.SSF.parse_date_code(serial);if(!d)throw new Error('Ungültiges Datum');const asOf=`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
 const h=table.findIndex(r=>r.includes('SecurityName')&&r.includes('Weighting'));const head=table[h];const ix=(s:string)=>head.indexOf(s);let total=0,others=0
 const rows:BreakdownRow[]=[],countries:BreakdownRow[]=[]
 for(const row of table.slice(h+1)){const name=String(row[ix('SecurityName')]||'');if(!name)continue;const weight=row[ix('Weighting')];if(typeof weight!=='number'||!Number.isFinite(weight))throw new Error('Ungültiger HSBC-Anteil.');total+=weight
 const isin=String(row[ix('ISIN')]||'');const country=String(row[ix('Country')]||'');
 if(isValidIsin(isin)&&weight>=0){if(weight===0)continue;rows.push({name,isin,weight});if(country)countries.push({name:country,weight})}else others+=weight
 }
 if(Math.abs(total-100)>.5||others<-.01)throw new Error('HSBC-Gewichte sind nicht als ungehebelte Verteilung darstellbar.')
 if(others>0)rows.push({name:'Liquidität, Derivate & Positionen ohne ISIN (netto)',weight:others})
 return finish(p,rows,countries,asOf,'HSBC · vollständige Bestandsliste',`https://www.assetmanagement.hsbc.co.uk/api/v1/download/document/${p.isin!.toLowerCase()}/gb/en/holdings`,'Vollständige HSBC-Anbieterliste eingelesen. Wertpapiere mit gültiger ISIN einzeln; Liquidität, Derivate, Verbindlichkeiten und Positionen ohne ISIN netto zusammengefasst. Prozentanteile direkt aus der Anbieterdatei; Länder nur für zugeordnete Wertpapiere.')
}
export async function loadHSBC(p:AnalysisProduct){return parseHSBC(await response(`https://www.assetmanagement.hsbc.co.uk/api/v1/download/document/${p.isin!.toLowerCase()}/gb/en/holdings`),p)}
