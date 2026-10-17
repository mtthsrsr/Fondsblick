import { contextBridge, ipcRenderer } from 'electron'
import type { API } from '../shared/model'
const api:API={refreshAll:onlyUpgrade=>ipcRenderer.invoke('funds:refreshAll',onlyUpgrade),importHoldings:()=>ipcRenderer.invoke('funds:importHoldings'),lookup:isin=>ipcRenderer.invoke('funds:lookup',isin),read:()=>ipcRenderer.invoke('funds:read'),save:state=>ipcRenderer.invoke('funds:save',state),exportData:()=>ipcRenderer.invoke('funds:export'),importData:()=>ipcRenderer.invoke('funds:import')}
contextBridge.exposeInMainWorld('fonds',api)
