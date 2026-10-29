'use strict';
const { app, BrowserWindow, ipcMain, session, protocol, dialog, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const net = require('node:net');
const { UpdateController } = require('./updater.cjs');
const path = require('node:path');
const { PortSelection } = require('./port-selection.cjs');
const APP_URL = 'registerwerk://app/index.html';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

protocol.registerSchemesAsPrivileged([{ scheme: 'registerwerk', privileges: {
  standard: true, secure: true, supportFetchAPI: true,
} }]);

// Only developer source runs may enter the smoke test. Packaged builds cannot.
const smoke = !app.isPackaged && process.argv.includes('--smoke-test');
app.setName('Registerwerk');
app.setPath('userData', path.join(app.getPath('appData'), 'Registerwerk'));
if (smoke && process.env.REGISTERWERK_SMOKE_DATA) app.setPath('userData', process.env.REGISTERWERK_SMOKE_DATA);
app.setAppUserModelId('de.kevinschmidt.registerwerk');
let window = null;
let selection = null;
let allowQuit = false;
let tcpSession = null;
let tcpTransaction = 0;

function closeTcpSession(reason = new Error('TCP-Verbindung wurde geschlossen.')) {
  const current = tcpSession;
  tcpSession = null;
  if (!current) return;
  if (current.pending) {
    clearTimeout(current.pending.timer);
    current.pending.reject(reason);
    current.pending = null;
  }
  current.socket.destroy();
}

function tcpFrameLength(mode, buffer) {
  if (mode === 'tcp') {
    if (buffer.length < 6) return null;
    const length = (buffer[4] << 8) | buffer[5];
    if (length < 2 || length > 254) throw new Error('Ungültige Modbus-TCP-Länge.');
    return 6 + length;
  }
  if (buffer.length < 2) return null;
  const fc = buffer[1];
  if (fc & 0x80) return 5;
  if ([1, 2, 3, 4].includes(fc)) {
    if (buffer.length < 3) return null;
    const size = 5 + buffer[2];
    if (size < 5 || size > 260) throw new Error('Ungültige RTU-Antwortlänge.');
    return size;
  }
  if ([5, 6, 15, 16].includes(fc)) return 8;
  throw new Error(`Nicht unterstützter Antwort-Funktionscode ${fc}.`);
}

function appendTcpData(current, chunk) {
  current.buffer = Buffer.concat([current.buffer, chunk]);
  const pending = current.pending;
  if (!pending) return;
  try {
    const size = tcpFrameLength(pending.mode, current.buffer);
    if (size === null || current.buffer.length < size) return;
    const response = current.buffer.subarray(0, size);
    current.buffer = current.buffer.subarray(size);
    if (pending.mode === 'tcp' && ((response[0] << 8) | response[1]) !== pending.transactionId) {
      throw new Error('Modbus-TCP-Antwort mit falscher Transaktions-ID.');
    }
    clearTimeout(pending.timer);
    current.pending = null;
    pending.resolve(Array.from(response));
  } catch (error) {
    clearTcpSession(current, error);
  }
}

function clearTcpSession(current, error) {
  if (tcpSession !== current) { current.socket.destroy(); return; }
  closeTcpSession(error instanceof Error ? error : new Error(String(error)));
}

function tcpConnect(host, port) {
  closeTcpSession(new Error('Vorherige TCP-Verbindung ersetzt.'));
  const socket = net.createConnection({ host, port });
  socket.setNoDelay(true);
  const current = { id: cryptoRandomId(), socket, buffer: Buffer.alloc(0), pending: null };
  tcpSession = current;
  socket.on('data', (chunk) => appendTcpData(current, chunk));
  socket.on('error', (error) => {
    if (tcpSession === current) closeTcpSession(new Error(`TCP-Verbindung fehlgeschlagen: ${error.message}`));
  });
  socket.on('close', () => {
    if (tcpSession === current) closeTcpSession(new Error('TCP-Verbindung wurde unterbrochen.'));
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (tcpSession === current) closeTcpSession(new Error('TCP-Verbindungsaufbau überschritt 5 Sekunden.'));
      reject(new Error('TCP-Verbindungsaufbau überschritt 5 Sekunden.'));
    }, 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      if (tcpSession !== current) return reject(new Error('TCP-Verbindung wurde abgebrochen.'));
      resolve(current.id);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`TCP-Verbindung fehlgeschlagen: ${error.message}`));
    });
  });
}

function cryptoRandomId() { return require('node:crypto').randomUUID(); }

function tcpExchange(id, rtuRequest, mode, timeoutMs) {
  const current = tcpSession;
  if (!current || current.id !== id || current.socket.destroyed) throw new Error('Keine aktive TCP-Verbindung.');
  if (current.pending) throw new Error('Eine TCP-Anfrage ist noch offen.');
  if (!Array.isArray(rtuRequest) || rtuRequest.length < 8 || rtuRequest.length > 260 || !rtuRequest.every((x) => Number.isInteger(x) && x >= 0 && x <= 255))
    throw new Error('Ungültiges Modbus-Telegramm.');
  if (!['tcp', 'ethRtu'].includes(mode) || !Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30000)
    throw new Error('Ungültige TCP-Anfrageparameter.');
  current.buffer = Buffer.alloc(0);
  let transactionId = null;
  let outgoing;
  if (mode === 'tcp') {
    transactionId = (tcpTransaction = (tcpTransaction + 1) & 0xffff);
    const unit = rtuRequest[0], pdu = rtuRequest.slice(1, -2);
    outgoing = Buffer.from([transactionId >> 8, transactionId & 255, 0, 0, (pdu.length + 1) >> 8, (pdu.length + 1) & 255, unit, ...pdu]);
  } else outgoing = Buffer.from(rtuRequest);
  return new Promise((resolve, reject) => {
    const pending = { mode, transactionId, resolve, reject, timer: null };
    current.pending = pending;
    pending.timer = setTimeout(() => {
      if (tcpSession === current && current.pending === pending) {
        current.pending = null;
        closeTcpSession(new Error(`Keine Antwort innerhalb von ${timeoutMs} ms; TCP-Verbindung aus Sicherheitsgründen getrennt.`));
      }
      reject(new Error(`Keine Antwort innerhalb von ${timeoutMs} ms.`));
    }, timeoutMs);
    current.socket.write(outgoing, (error) => {
      if (!error || current.pending !== pending) return;
      clearTimeout(pending.timer);
      current.pending = null;
      closeTcpSession(new Error(`TCP-Senden fehlgeschlagen: ${error.message}`));
      reject(error);
    });
  });
}

function ownContents(contents) {
  return Boolean(window && !window.isDestroyed() && contents === window.webContents && contents.getURL() === APP_URL);
}
function ownMessage(event) {
  return ownContents(event.sender) && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === APP_URL;
}
function sendPorts(payload) {
  if (window && !window.isDestroyed()) window.webContents.send('registerwerk:ports', payload);
}

async function createWindow() {
  const ses = session.fromPartition('persist:registerwerk');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const assets = new Set(['index.html', 'app.css', 'app.js', 'desktop.css', 'desktop-ui.js']);
  ses.protocol.handle('registerwerk', async (request) => {
    const url = new URL(request.url);
    const filename = url.pathname.slice(1);
    if (request.method !== 'GET' || url.hostname !== 'app' || url.search || !assets.has(filename)) {
      return new Response('Nicht gefunden', { status: 404 });
    }
    try {
      const bytes = await fs.readFile(path.join(__dirname, '..', 'renderer', filename));
      return new Response(bytes, { headers: { 'Content-Type': types[path.extname(filename)],
        'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' } });
    } catch {
      return new Response('Datei nicht verfuegbar', { status: 404 });
    }
  });
  window = new BrowserWindow({
    width: 1500, height: 1000, minWidth: 900, minHeight: 650, show: false,
    title: 'Registerwerk', backgroundColor: '#f3f6f8',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { session: ses, preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  selection = new PortSelection(sendPorts);
  const mode = !app.isPackaged ? 'development' : process.platform !== 'win32' ? 'unsupported' :
    process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' :
      fsSync.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Registerwerk.exe')) ? 'installed' : 'folder';
  const updates = new UpdateController({
    updater: mode === 'installed' ? require('electron-updater').autoUpdater : null,
    version: app.getVersion(), mode,
    notify: (state) => { if (window && !window.isDestroyed()) window.webContents.send('registerwerk:update-state', state); },
    canInstall: async () => !selection.pending && await window.webContents.executeJavaScript('window.registerwerkUpdateIdle?.() === true'),
    prepare: async () => !selection.pending && await window.webContents.executeJavaScript('window.registerwerkPrepareUpdate?.() === true'),
    rollback: () => { if (window && !window.isDestroyed()) window.webContents.executeJavaScript('window.registerwerkCancelUpdate?.()').catch(() => {}); },
    confirm: async (version) => {
      const answer = await dialog.showMessageBox(window, { type: 'question', title: 'Update installieren',
        message: `Version ${version} jetzt installieren?`, detail: 'Registerwerk wird geschlossen und nach der Installation neu gestartet.',
        buttons: ['Abbrechen', 'Jetzt installieren'], defaultId: 0, cancelId: 0 });
      return answer.response === 1;
    },
  });
  ipcMain.handle('registerwerk:update', (event, action) => {
    if (!ownMessage(event)) throw new Error('Update-Anfrage nicht erlaubt.');
    if (action === 'state') return updates.snapshot();
    if (action === 'releases') return shell.openExternal('https://github.com/KS-303/Registerwerk/releases');
    if (['check', 'download', 'install'].includes(action)) return updates[action]();
    throw new Error('Unbekannte Update-Aktion.');
  });
  ipcMain.handle('registerwerk:tcp-connect', async (event, args) => {
    if (!ownMessage(event)) throw new Error('TCP-Anfrage nicht erlaubt.');
    const host = typeof args?.host === 'string' ? args.host.trim() : '';
    const port = Number(args?.port);
    if (!host || host.length > 253 || /[\s/\\]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Bitte IP-Adresse/Hostname und einen gültigen TCP-Port eingeben.');
    return tcpConnect(host, port);
  });
  ipcMain.handle('registerwerk:tcp-exchange', (event, args) => {
    if (!ownMessage(event)) throw new Error('TCP-Anfrage nicht erlaubt.');
    return tcpExchange(args?.sessionId, args?.request, args?.mode, args?.timeoutMs);
  });
  ipcMain.handle('registerwerk:tcp-disconnect', (event, sessionId) => {
    if (!ownMessage(event)) throw new Error('TCP-Anfrage nicht erlaubt.');
    if (tcpSession?.id === sessionId) closeTcpSession();
    return true;
  });

  ses.setPermissionCheckHandler((contents, permission) => permission === 'serial' && ownContents(contents));
  ses.setPermissionRequestHandler((contents, permission, callback) => callback(permission === 'serial' && ownContents(contents)));
  ses.on('select-serial-port', (event, ports, contents, callback) => {
    event.preventDefault();
    if (!ownContents(contents)) { callback(''); return; }
    selection.start(ports, callback);
  });
  ses.on('serial-port-added', (_event, port, contents) => {
    if (ownContents(contents)) selection.update('added', port);
  });
  ses.on('serial-port-removed', (_event, port, contents) => {
    if (ownContents(contents)) selection.update('removed', port);
  });
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  ses.on('will-download', (event, item, contents) => {
    if (!ownContents(contents) || !item.getURL().startsWith('blob:registerwerk://app/')) { event.preventDefault(); return; }
    item.setSaveDialogOptions({ title: 'Projektdatei speichern', buttonLabel: 'Speichern',
      defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename())),
      filters: [{ name: 'Registerwerk-Projekt', extensions: ['json'] }] });
  });
  ipcMain.handle('registerwerk:select-port', (event, value) => {
    if (!ownMessage(event) || !value || typeof value.requestId !== 'string') return { ok: false };
    return { ok: selection.choose(value.requestId, value.portId) };
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== APP_URL) event.preventDefault(); });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-prevent-unload', (event) => {
    if (allowQuit) { event.preventDefault(); return; }
    const choice = dialog.showMessageBoxSync(window, { type: 'question',
      buttons: ['Zurück', 'App schließen'], defaultId: 0, cancelId: 0,
      title: 'Verbindung noch geöffnet', message: 'Registerwerk wirklich schließen?',
      detail: 'Die Geräteverbindung wird getrennt und laufende Abfragen werden beendet.' });
    if (choice === 1) event.preventDefault();
  });
  window.once('ready-to-show', () => { if (!smoke) window.show(); });
  window.on('closed', () => { selection.cancel(); window = null; });
  await window.loadURL(APP_URL);
  if (!smoke && mode === 'installed') setImmediate(() => updates.check());
  if (smoke) {
    try {
      await require('../scripts/smoke-in-app.cjs')({ app, window, ses, selection, appUrl: APP_URL });
      console.log('REGISTERWERK_SMOKE_PASS');
      allowQuit = true;
      app.exit(0);
    } catch (error) {
      console.error(error.stack || error);
      allowQuit = true;
      app.exit(1);
    }
  }
}
if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  });
  app.whenReady().then(createWindow).catch((error) => { console.error(error); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => closeTcpSession());
}
