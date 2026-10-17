import {withProductLink} from '../shared/links'
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import Store from 'electron-store'
import { readSheets } from './issuerProviders'
import { join, basename } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { mergeProduct } from '../shared/merge'
import { lookupISIN } from './providers'
import { validateState } from '../shared/validation'
import type { State } from '../shared/model'

app.setName('Fondsblick')
app.setPath('userData',process.env.FONDSBLICK_DATA_DIR||join(app.getPath('appData'),'Fondsblick'))
const store=new Store({name:'portfolio'})
const empty:State={version:1,entries:[]}
const read=():State=>{const data=store.get('data',empty);validateState(data);const entries=data.entries.map(e=>({...e,product:withProductLink(e.product)}));const next={...data,entries};if(JSON.stringify(next)!==JSON.stringify(data))store.set('data',next);return next}
if(!app.requestSingleInstanceLock()){app.quit()}else{
  let win:BrowserWindow|null=null
  app.on('second-instance',()=>{win?.show();win?.focus()})
  app.whenReady().then(()=>{
    let refreshing=false
    ipcMain.handle('funds:refreshAll',async(_event,onlyUpgrade=false)=>{
      if(refreshing)return {state:read(),message:'Aktualisierung läuft bereits.'}
      const before=read();const entries=onlyUpgrade?before.entries.filter(e=>/^(Amundi|HSBC) /i.test(e.product.name)&&(!e.product.breakdowns.holdings?.source.includes('vollständige Bestandsliste'))):before.entries
      if(!entries.length)return {state:before,message:''}
      refreshing=true
      try{const results=await Promise.all(entries.map(async e=>({id:e.product.id,result:await lookupISIN(e.product.isin!).catch(()=>null)})));const latest=read();let count=0
      const state:State={version:1,entries:latest.entries.map(e=>{const p=results.find(r=>r.id===e.product.id)?.result?.product;if(!p)return e;count++;return {...e,product:mergeProduct(e.product,p)}})}
      validateState(state);store.set('beforeProviderRefresh',latest);store.set('data',state)
      return {state,message:`${count} von ${entries.length} Produkten aktualisiert. Eigene Angaben und Bestände bleiben erhalten.`}
      }finally{refreshing=false}
    })
    ipcMain.handle('funds:importHoldings' ,async()=>{const {filePaths,canceled}=await dialog.showOpenDialog({title:'Bestandsliste importieren',properties:['openFile'],filters:[{name:'Bestandslisten',extensions:['csv','tsv','xlsx','xls']}]});if(canceled||!filePaths[0])return null;return {name:basename(filePaths[0]),sheets:readSheets(await readFile(filePaths[0]))}})
    ipcMain.handle('funds:lookup',(_event,isin:unknown)=>{if(typeof isin!=='string'||isin.length>100)throw new Error('Ungültige ISIN.');return lookupISIN(isin)})
    ipcMain.handle('funds:read',()=>read())
    ipcMain.handle('funds:save',(_event,state:unknown)=>{validateState(state);store.set('data',state)})
    ipcMain.handle('funds:export',async()=>{const {filePath,canceled}=await dialog.showSaveDialog({title:'Portfolio sichern',defaultPath:`Fondsblick-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'Fondsblick-Datei',extensions:['json']}]});if(canceled||!filePath)return false;await writeFile(filePath,JSON.stringify(read(),null,2));return true})
    ipcMain.handle('funds:import',async()=>{const {filePaths,canceled}=await dialog.showOpenDialog({title:'Fondsblick-Sicherung öffnen',properties:['openFile'],filters:[{name:'Fondsblick-Datei',extensions:['json']}]});if(canceled||!filePaths[0])return null;const text=await readFile(filePaths[0],'utf8');if(text.length>10_000_000)throw new Error('Datei zu groß.');const next=JSON.parse(text);validateState(next);const answer=await dialog.showMessageBox({type:'question',message:'Gespeicherte Produkte durch diese Sicherung ersetzen?',detail:'Der bisherige Stand wird vorher automatisch lokal gesichert.',buttons:['Abbrechen','Wiederherstellen'],defaultId:0,cancelId:0});if(answer.response!==1)return null;store.set('beforeImport',store.get('data',empty));store.set('data',next);return next})
    const create=()=>{
      win=new BrowserWindow({width:1380,height:920,minWidth:1020,minHeight:700,title:'Fondsblick',backgroundColor:'#f5f6f8',titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',webPreferences:{preload:join(__dirname,'../preload/index.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}})
      win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url))void shell.openExternal(url);return {action:'deny'}})
      win.webContents.on('will-navigate',event=>event.preventDefault())
      void win.loadFile(join(__dirname,'../renderer/index.html'))
      win.on('closed',()=>{win=null})
    }
    create();app.on('activate',()=>{if(!win)create();else win.show()})
  })
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})
}
