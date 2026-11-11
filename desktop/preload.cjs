'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const initialPreferences = ipcRenderer.sendSync('registerwerk:preferences-initial');
contextBridge.exposeInMainWorld('registerwerkDesktop', Object.freeze({
  preferences: initialPreferences?.value || null,
  preferencesWarning: initialPreferences?.warning || '',
  savePreferences(patch) { return ipcRenderer.invoke('registerwerk:preferences', patch); },
  update(action) { return ipcRenderer.invoke('registerwerk:update', action); },
  onUpdate(callback) {
    if (typeof callback !== 'function') return;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('registerwerk:update-state', listener);
    return () => ipcRenderer.removeListener('registerwerk:update-state', listener);
  },
  onPorts(callback) {
    if (typeof callback !== 'function') return;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('registerwerk:ports', listener);
    return () => ipcRenderer.removeListener('registerwerk:ports', listener);
  },
  selectedPortName() { return ipcRenderer.invoke('registerwerk:selected-port-name'); },
  selectPort(requestId, portId) {
    return ipcRenderer.invoke('registerwerk:select-port', { requestId, portId });
  },
  onTxSaved(callback) {
    if (typeof callback !== 'function') return;
    const listener = () => callback(); ipcRenderer.on('registerwerk:tx-saved', listener);
    return () => ipcRenderer.removeListener('registerwerk:tx-saved', listener);
  },
  onTcpClosed(callback) {
    if (typeof callback !== 'function') return;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('registerwerk:tcp-closed', listener);
    return () => ipcRenderer.removeListener('registerwerk:tcp-closed', listener);
  },
  onTcpNotice(callback) {
    if (typeof callback !== 'function') return;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('registerwerk:tcp-notice', listener);
    return () => ipcRenderer.removeListener('registerwerk:tcp-notice', listener);
  },
  tcpConnect(host, port) { return ipcRenderer.invoke('registerwerk:tcp-connect', { host, port }); },
  tcpExchange(sessionId, request, mode, timeoutMs, guardMs = 0) {
    return ipcRenderer.invoke('registerwerk:tcp-exchange', { sessionId, request: Array.from(request), mode, timeoutMs, guardMs });
  },
  tcpDisconnect(sessionId) { return ipcRenderer.invoke('registerwerk:tcp-disconnect', sessionId); },
}));
