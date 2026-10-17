import type { SavedProduct } from './model'
import { marketValue } from './model'
export type View = 'countries'|'holdings'
export interface Row { key:string;name:string;value:number;weight:number;sources:string[];unknown:boolean }
const countries:Record<string,string>={ 'united states':'USA','vereinigte staaten':'USA','vereinigte staaten von amerika':'USA','usa':'USA','united kingdom':'Großbritannien','grossbritannien':'Großbritannien','großbritannien':'Großbritannien','germany':'Deutschland','deutschland':'Deutschland','switzerland':'Schweiz','schweiz':'Schweiz','japan':'Japan','china':'China','taiwan':'Taiwan','south korea':'Südkorea','korea':'Südkorea','korea (south)':'Südkorea','india':'Indien','france':'Frankreich','italy':'Italien','spain':'Spanien','sweden':'Schweden','denmark':'Dänemark','finland':'Finnland','norway':'Norwegen','netherlands':'Niederlande','belgium':'Belgien','australia':'Australien','new zealand':'Neuseeland','austria':'Österreich','israel':'Israel','ireland':'Irland','singapore':'Singapur','hong kong':'Hongkong','brazil':'Brasilien','south africa':'Südafrika','saudi arabia':'Saudi-Arabien','united arab emirates':'Vereinigte Arabische Emirate','mexico':'Mexiko','indonesia':'Indonesien','malaysia':'Malaysia','philippines':'Philippinen','turkey':'Türkei','poland':'Polen','greece':'Griechenland','czech republic':'Tschechien','hungary':'Ungarn','qatar':'Katar','kuwait':'Kuwait','egypt':'Ägypten','canada':'Kanada','kanada':'Kanada' }
export function aggregate(entries:SavedProduct[],view:View,single=false,library=entries) {
  const map=new Map<string,Row>()
  let total=0
  const add=(name:string,value:number,source:string,isin?:string,unknown=false)=>{
    if(value<=1e-8)return
    if(view==='countries')name=countries[name.toLowerCase()]||name
    const key=unknown?'unknown':isin||name.toLocaleLowerCase()
    const previous=map.get(key)
    map.set(key,{key,name,value:(previous?.value||0)+value,weight:0,sources:[...new Set([...(previous?.sources||[]),source])],unknown})
  }
  const unknown=(value:number,source:string)=>add('Nicht aufgeschlüsselt',value,source,undefined,true)
  function visit(entry:SavedProduct,value:number,source:string,visited:Set<string>) {
    const p=entry.product
    if(visited.has(p.id)||visited.size>10||p.kind==='structured'){unknown(value,source);return}
    const path=new Set([...visited,p.id])
    if(view==='countries'&&p.kind==='commodity'&&p.basis==='exposure'){add('Nicht anwendbar · Rohstoffe',value,source);return}
    const data=p.breakdowns[view]
    if(!data?.rows.length){if(view==='holdings'&&p.kind==='stock')add(p.name,value,source,p.isin);else unknown(value,source);return}
    const sum=data.rows.reduce((s,r)=>s+r.weight,0)
    if(!Number.isFinite(sum)||sum>100.5||data.rows.some(r=>r.weight<0)){unknown(value,source);return}
    for(const r of data.rows){
      const amount=value*r.weight/Math.max(100,sum)
      const child=r.isin&&library.find(e=>e.product.isin===r.isin)
      if(view==='holdings'&&child&&child.product.kind!=='stock')visit(child,amount,source,path)
      else if(/^(sonstige|other|others|rest|cash und derivate)$/i.test(r.name))unknown(amount,source)
      else add(r.name,amount,source,view==='holdings'?r.isin:undefined)
    }
    unknown(value*Math.max(0,1-sum/100),source)
  }
  for(const e of entries){const value=single?100:marketValue(e.investment);if(!Number.isFinite(value)||value<=0)continue;total+=value;visit(e,value,e.product.name,new Set())}
  const rows=[...map.values()].map(r=>({...r,weight:total?r.value/total*100:0})).sort((a,b)=>b.value-a.value)
  return {rows,total,coverage:total?100-rows.filter(r=>r.unknown).reduce((s,r)=>s+r.weight,0):0}
}
