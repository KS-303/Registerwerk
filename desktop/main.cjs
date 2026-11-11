'use strict';
const { app, BrowserWindow, ipcMain, session, protocol, dialog, Menu, shell, screen, nativeTheme } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { ModbusTransport } = require('./modbus-transport.cjs');
const { UpdateController } = require('./updater.cjs');
const path = require('node:path');
const { PortSelection } = require('./port-selection.cjs');
const { SettingsStore, visibleBounds } = require('./settings.cjs');
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
const preferences = new SettingsStore(app.getPath('userData'));
let window = null;
let selection = null;
let selectedPortName = '';
let allowQuit = false;
const transport = new ModbusTransport({
  readOnly: () => preferences.value.readOnly,
  onClosed: payload => {
    if (window && !window.isDestroyed()) window.webContents.send('registerwerk:tcp-closed', payload);
  },
  onNotice: payload => {
    if (window && !window.isDestroyed()) window.webContents.send('registerwerk:tcp-notice', payload);
  },
});
function closeTcpSession() { transport.close(); }

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
  nativeTheme.themeSource = preferences.value.theme;
  const ses = session.fromPartition('persist:registerwerk');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const assets = new Set(['index.html', 'app.css', 'app.js', 'desktop.css', 'desktop-ui.js', 'shell.js', 'shell.css']);
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
    width: 1500, height: 1000, ...visibleBounds(preferences.value.window, screen.getAllDisplays().map(d=>d.workArea)), minWidth: 900, minHeight: 650, show: false,
    title: 'Registerwerk', backgroundColor: '#f3f6f8',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { session: ses, preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false },
  });
  if (preferences.value.window?.maximized) window.maximize();
  window.on('close', () => {
    try { preferences.update({window:{...window.getNormalBounds(),maximized:window.isMaximized()}}); }
    catch(e) { console.error('Fenstereinstellungen nicht gespeichert:',e.message); }
  });
  ipcMain.on('registerwerk:preferences-initial', (event) => {
    event.returnValue = ownMessage(event) ? {value:preferences.snapshot(),warning:preferences.warning} : null;
  });
  ipcMain.handle('registerwerk:preferences', async (event, patch) => {
    if(!ownMessage(event)) throw Error('Einstellungsanfrage nicht erlaubt.');
    if(patch==='appearance-reset') { const value=preferences.resetAppearance();nativeTheme.themeSource=value.theme;return value; }
    const allowed=['theme','accent','density','lastPage','introSeen','sidebarCompact','startupMode','collapsedGroups','nameWidth','showRaw','tableDetails','restoreSession','autoCheck','readOnly','connection'];
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!allowed.includes(k))) throw Error('Ungültige persönliche Einstellungen.');
    const value=preferences.update(patch);nativeTheme.themeSource=value.theme;return value;
  });
  Menu.setApplicationMenu(null);
  selection = new PortSelection(sendPorts);
  const mode = !app.isPackaged ? 'development' : process.platform !== 'win32' ? 'unsupported' :
    process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' :
      fsSync.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Registerwerk.exe')) ? 'installed' : 'folder';
  const updater = mode === 'installed' ? require('electron-updater').autoUpdater : null;
  const updates = new UpdateController({
    updater,
    verifyReady: async () => { if (!updater?.installerPath) throw Error('Keine heruntergeladene Update-Datei vorhanden.'); await fs.access(updater.installerPath); },
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
    return transport.connect(host, port);
  });
  ipcMain.handle('registerwerk:tcp-exchange', async (event, args) => {
    if (!ownMessage(event)) throw new Error('TCP-Anfrage nicht erlaubt.');
    try {
      return await transport.exchange(args?.sessionId, args?.request, args?.mode, args?.timeoutMs, args?.guardMs ?? 0);
    } catch (error) {
      // Electron IPC retains Error.message, but not custom Error.code properties.
      throw new Error(`[${error.code || 'INVALID_REQUEST'}] ${error.message}`);
    }
  });
  ipcMain.handle('registerwerk:tcp-disconnect', (event, sessionId) => {
    if (!ownMessage(event)) throw new Error('TCP-Anfrage nicht erlaubt.');
    transport.disconnect(sessionId);
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
    const isIoopt = path.extname(item.getFilename()).toLowerCase() === '.ioopt';
    if (isIoopt) item.once('done', (_event, result) => { if (result === 'completed' && window && !window.isDestroyed()) window.webContents.send('registerwerk:tx-saved'); });
    item.setSaveDialogOptions({ title: isIoopt ? 'TX Open Punktvorlage speichern' : 'Projektdatei speichern', buttonLabel: 'Speichern',
      defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename())),
      filters: isIoopt ? [{ name: 'TX Open Punktvorlage', extensions: ['ioopt'] }] : [{ name: 'Registerwerk-Projekt', extensions: ['json'] }] });
  });
  ipcMain.handle('registerwerk:selected-port-name',event=>{if(!ownMessage(event))throw Error('Portanfrage nicht erlaubt.');return selectedPortName;});
  ipcMain.handle('registerwerk:select-port', (event, value) => {
    if (!ownMessage(event) || !value || typeof value.requestId !== 'string') return { ok: false };
    const selected = selection.pending?.ports.get(value.portId);
    if(selected && selection.pending?.requestId===value.requestId)selectedPortName=selected.portName||selected.displayName;
    const ok=selection.choose(value.requestId,value.portId);
    if(ok&&selected) { try{preferences.update({lastPortName:selected.portName||selected.displayName});}catch{} }
    return { ok };
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== APP_URL) event.preventDefault(); });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-prevent-unload', (event) => {
    if (allowQuit) { event.preventDefault(); return; }
    const choice = dialog.showMessageBoxSync(window, { type: 'question',
      buttons: ['Zurück', 'App schließen'], defaultId: 0, cancelId: 0,
      title: 'Registerwerk schließen', message: 'Registerwerk wirklich schließen?',
      detail: 'Eine offene Verbindung wird getrennt. Nicht exportierte Änderungen an einer TX-Vorlage gehen verloren.' });
    if (choice === 1) event.preventDefault();
  });
  window.once('ready-to-show', () => { if (!smoke) window.show(); });
  window.on('closed', () => { selection.cancel(); window = null; });
  await window.loadURL(APP_URL);
  if (!smoke && mode === 'installed' && preferences.value.autoCheck) setImmediate(() => updates.check());
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
