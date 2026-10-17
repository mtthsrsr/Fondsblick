import {isValidIsin,validateBreakdown,type BreakdownRow} from './analysis'
export interface ImportSheet { name:string;rows:string[][] }
export interface ImportFile {name:string;sheets:ImportSheet[]}
export interface ImportMapping {header:number;name:number;weight:number;isin:number;country:number;unit:'percent'|'fraction';decimal:','|'.'}
const key=(s:string)=>s.toLowerCase().trim().replace(/[\s_%().-]/g,'')
export function guessMapping(rows:string[][]):ImportMapping {
 const names=['name','securityname','security','holding','bestandteil','bezeichnung','wertpapier','titel','land','country'];const weights=['weight','weighting','gewicht','anteil','gewichtung','portfolio','fundweight','weightpercent']
 const header=rows.findIndex(r=>r.some(c=>names.includes(key(c)))&&r.some(c=>weights.includes(key(c))))
 const r=rows[Math.max(0,header)]||[];return {header:Math.max(0,header),name:r.findIndex(c=>names.includes(key(c))),weight:r.findIndex(c=>weights.includes(key(c))),isin:r.findIndex(c=>['isin','securityisin'].includes(key(c))),country:r.findIndex(c=>['country','land','countryofrisk','risikoland'].includes(key(c))),unit:'percent',decimal:','}
}
export function importedRows(rows:string[][],m:ImportMapping,view:'holdings'|'countries'){
 if(m.name<0||m.weight<0||m.name===m.weight)throw new Error('Bitte unterschiedliche Spalten für Name und Anteil auswählen.')
 if(rows.length>20000)throw new Error('Die Datei enthält mehr als 20.000 Zeilen.')
 const out=new Map<string,BreakdownRow>();let used=0
 for(let i=m.header+1;i<rows.length;i++){const r=rows[i];if(r.every(c=>!c.trim()))continue;const name=(r[m.name]||'').trim(),text=(r[m.weight]||'').trim();if(!name||!text)throw new Error(`Zeile ${i+1}: Name oder Anteil fehlt. Entferne Hinweise und Summenzeilen aus der Tabelle.`)
 let numeric=text.replace(/[%\s\u00a0]/g,'');if(m.decimal===',')numeric=numeric.replace(/\./g,'').replace(',','.');else numeric=numeric.replace(/,/g,'');if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(numeric))throw new Error(`Zeile ${i+1}: Anteil nicht lesbar.`)
 const weight=Number(numeric)*(m.unit==='fraction'&&!text.includes('%')?100:1);if(!Number.isFinite(weight)||weight<0||weight>100)throw new Error(`Zeile ${i+1}: Anteil muss zwischen 0 und 100 % liegen. Negative Positionen vorher fachlich zusammenfassen.`)
 const isin=view==='holdings'&&m.isin>=0?(r[m.isin]||'').trim().toUpperCase():undefined;if(isin&&!isValidIsin(isin))throw new Error(`Zeile ${i+1}: Ungültige ISIN.`)
 const id=isin||name.toLowerCase();out.set(id,{name,isin:isin||undefined,weight:(out.get(id)?.weight||0)+weight});used++
 }
 const result=[...out.values()];const invalid=validateBreakdown({rows:result,asOf:new Date().toISOString().slice(0,10),source:'Import',manual:true});if(invalid)throw new Error(invalid);return {rows:result,merged:used-result.length,total:result.reduce((s,r)=>s+r.weight,0)}
}
