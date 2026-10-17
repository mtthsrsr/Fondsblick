import type { AnalysisProduct } from './analysis'
export interface Certificate {wkn?:string;type?:string;issuer?:string;status?:string;sourceUrl:string;quoteAsOf?:string;bid?:number;ask?:number;quoteUnit?:string;details:Record<string,string>;documents:Array<{name:string;url:string}>}
export interface Product extends AnalysisProduct { productUrl?:string; personalUrl?:string; certificate?:Certificate; verified: boolean; checkedAt: string; identitySource?: string }
export interface Investment { mode: 'value' | 'units'; valueEUR: number; quantity: number; priceEUR: number; asOf: string }
export interface SavedProduct { product: Product; investment?: Investment }
export interface State { version: 1; entries: SavedProduct[] }
export interface Lookup { status:'found'|'not-found'|'unavailable'; product?:Product; message:string }
export interface API {
  refreshAll:(onlyUpgrade?:boolean)=>Promise<{state:State;message:string}>
  importHoldings: ()=>Promise<import('./import').ImportFile|null>
  lookup: (isin:string)=>Promise<Lookup>
  read: ()=>Promise<State>
  save: (state:State)=>Promise<void>
  exportData: ()=>Promise<boolean>
  importData: ()=>Promise<State|null>
}
declare global { interface Window { fonds:API } }
export const marketValue=(investment?:Investment):number=> investment ? investment.mode==='value' ? investment.valueEUR : investment.quantity*investment.priceEUR : 0
