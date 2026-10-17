import type {Product} from './model'
import type {Dimension} from './analysis'
export function mergeProduct(old:Product,next:Product):Product {
 const breakdowns={...old.breakdowns,...next.breakdowns};let retained=false
 for(const key of Object.keys(old.breakdowns) as Dimension[]){const before=old.breakdowns[key],after=next.breakdowns[key];if(!before)continue
 const sum=(rows:typeof before.rows)=>rows.reduce((s,r)=>s+r.weight,0)
 if(before.manual||!after||after.asOf<before.asOf||(before.rows.length>20&&after.rows.length<=10&&sum(after.rows)<sum(before.rows)-1)){breakdowns[key]=before;if(!before.manual)retained=true}
 }
 return {...next,productUrl:next.productUrl||old.productUrl,personalUrl:old.personalUrl,breakdowns,notes:(next.notes||'')+(retained?' Frühere, umfangreichere Aufteilungen bleiben erhalten. Ihre Datenstände stehen an den Diagrammen.':'')}
}
