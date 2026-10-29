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
  tcpConnect(host, port) { return ipcRenderer.invoke('registerwerk:tcp-connect', { host, port }); },
  tcpExchange(sessionId, request, mode, timeoutMs) {
    return ipcRenderer.invoke('registerwerk:tcp-exchange', { sessionId, request: Array.from(request), mode, timeoutMs });
  },
  tcpDisconnect(sessionId) { return ipcRenderer.invoke('registerwerk:tcp-disconnect', sessionId); },
}));
