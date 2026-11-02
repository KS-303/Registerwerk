'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('registerwerkDesktop', Object.freeze({
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
  tcpConnect(host, port) { return ipcRenderer.invoke('registerwerk:tcp-connect', { host, port }); },
  tcpExchange(sessionId, request, mode, timeoutMs) {
    return ipcRenderer.invoke('registerwerk:tcp-exchange', { sessionId, request: Array.from(request), mode, timeoutMs });
  },
  tcpDisconnect(sessionId) { return ipcRenderer.invoke('registerwerk:tcp-disconnect', sessionId); },
}));
