'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('registerwerkDesktop', Object.freeze({
  onPorts(callback) {
    if (typeof callback !== 'function') return;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('registerwerk:ports', listener);
    return () => ipcRenderer.removeListener('registerwerk:ports', listener);
  },
  selectPort(requestId, portId) {
    return ipcRenderer.invoke('registerwerk:select-port', { requestId, portId });
  },
}));
