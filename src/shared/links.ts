import type {Product} from './model'
export function validProductUrl(value:unknown):value is string {if(typeof value!=='string'||value.length>3000)return false;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&Boolean(u.hostname)}catch{return false}}
export function withProductLink(p:Product):Product {
 if(p.productUrl)return p
 let url:string|undefined
 if(p.certificate)url=p.certificate.sourceUrl
 else if(p.provider==='deka-etf'&&p.providerPath?.startsWith('/etfs/'))url='https://www.deka-etf.de'+p.providerPath
 else if(p.provider==='deka-fund'&&p.isin)url=`https://www.deka.de/privatkunden-legacy/fondsprofil?fl=1&id=${p.isin}`
 else if(p.identitySource?.startsWith('justETF')&&p.isin)url=`https://www.justetf.com/de/etf-profile.html?isin=${p.isin}`
 else if(p.provider==='union-snapshot')url=p.breakdowns.holdings?.sourceUrl
 return url&&validProductUrl(url)?{...p,productUrl:url}:p
}
