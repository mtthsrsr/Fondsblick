import {decodeHtml} from './deka'
import type {Product} from '../shared/model'
const clean=(s:string)=>decodeHtml(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()
export function parseCertificate(html:string,isin:string):Product|null {
 const header=html.match(/<div class="zertifikat-profile-header[\s\S]*?(?=<div class="tabs tabs-big)/)?.[0]
 if(!header)return null
 const fields:Record<string,string>={}
 for(const m of header.matchAll(/<span class="overline[^"]*">([\s\S]*?)<\/span>\s*(?:<\/span>\s*)?<div class="item-detail">([\s\S]*?)<\/div>/g))fields[clean(m[1])]=clean(m[2])
 // The structured identity field must match; the URL alone is not evidence.
 const identity=fields['ISIN / WKN'];if(!identity||identity.split('/')[0].trim()!==isin)return null
 const name=clean(header.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]||'');if(!name)return null
 const details:Record<string,string>={}
 for(const m of html.matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)){const k=clean(m[1]),v=clean(m[2]);if(k&&v&&!details[k])details[k]=v}
 const quotes=fields['Geldkurs/Briefkurs']?.match(/^([\d.,]+)\s+([A-Z]{3}|%)\s*\/\s*([\d.,]+)\s+([A-Z]{3}|%)$/)
 const number=(s:string)=>Number(s.replace(/\./g,'').replace(',','.'))
 const stamp=clean(header).match(/Stand vom (\d{2}\.\d{2}\.\d{4},\s*\d{2}:\d{2} Uhr)/)?.[1]
 const url=`https://www.deka.de/zertifikate/zertifikatsprofil?isin=${isin}`
 const documents=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="download-link"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({name:clean(m[2]),url:new URL(decodeHtml(m[1]),'https://www.deka.de').href})).filter(d=>d.url.startsWith('https://www.deka.de/')&&d.url.includes(isin))
 return {id:isin,isin,name,kind:'structured',provider:'deka-certificate',currency:details['Währung des Produkts']||'EUR',basis:'exposure',verified:true,checkedAt:new Date().toISOString(),identitySource:'DekaBank · offizielles Zertifikatsprofil',breakdowns:{},notes:'Zertifikat mit vertraglichem Auszahlungsprofil und Emittentenrisiko. Basiswert und Lieferwert sind keine unmittelbar gehaltenen Fondsbestände.',certificate:{wkn:identity.split('/')[1]?.trim(),type:fields.Produkttyp,issuer:details.Emittent||fields.Emittent,status:fields.Status,sourceUrl:url,quoteAsOf:stamp,bid:quotes?number(quotes[1]):undefined,ask:quotes?number(quotes[3]):undefined,quoteUnit:quotes&&quotes[2]===quotes[4]?quotes[2]:undefined,details,documents}}
}
export async function lookupCertificate(isin:string){const response=await fetch(`https://www.deka.de/zertifikate/zertifikatsprofil?isin=${isin}`,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Mozilla/5.0 Fondsblick/1.2'}});if(!response.ok)return null;const html=await response.text();if(html.length>5_000_000)return null;return parseCertificate(html,isin)}
