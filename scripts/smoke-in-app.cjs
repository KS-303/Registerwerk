'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async ({ window, ses, selection, app, appUrl }) => {
  const run = (code) => window.webContents.executeJavaScript(code, true);
  const wait = async (code) => {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (await run(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Wartebedingung nicht erfuellt: ' + code);
  };
  await wait("document.querySelectorAll('#pointRows tr').length === 1 && !!window.registerwerkDesktop");
  assert.equal(await run('window.isSecureContext'), true);
  assert.equal(await run("typeof navigator.serial.requestPort"), 'function');
  assert.equal(await run("typeof require"), 'undefined');
  assert.equal(await run("document.querySelector('#skipErrors').checked"), true);
  assert.equal(window.webContents.getURL(), appUrl);
  console.log('PASS Electron-Start, isolierte Oberflaeche und Web Serial');
  await wait("document.querySelector('#desktopVersion')?.textContent.includes('0.1.1')");
  await run("document.querySelector('#openUpdates').click()");
  assert.equal(await run("document.querySelector('#updateDialog').classList.contains('show')"), true);
  assert.equal(await run("document.querySelector('#updateCheck').disabled"), true);
  assert.equal(await run("window.registerwerkUpdateIdle()"), true);
  assert.equal(await run("window.registerwerkPrepareUpdate()"), true);
  assert.equal(await run("document.body.inert"), true);
  await run("window.registerwerkCancelUpdate(); document.querySelector('#updateClose').click()");
  assert.equal(await run("document.body.inert"), false);
  console.log('PASS Versionsanzeige, Update-Dialog und Installationssperre');
  const updater = require('electron-updater').autoUpdater;
  assert.equal(updater.currentVersion.version, app.getVersion());
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  assert.equal(updater.autoInstallOnAppQuit, false);
  console.log('PASS Echte Updater-Abhaengigkeit im Electron-Prozess geladen');
  await run("document.querySelector('#openHelp').click()");
  assert.equal(await run("document.querySelector('#helpDialog').classList.contains('show')"), true);
  await run("document.querySelector('#closeHelp').click(); document.querySelector('#sameDeviceAddress').click(); document.querySelector('#addPoint').click(); const device = document.querySelector('.device-input'); device.value = '17'; device.dispatchEvent(new Event('input', {bubbles:true}));");
  assert.deepEqual(await run("[...document.querySelectorAll('.device-input')].map(e => e.value)"), ['17', '17']);
  console.log('PASS Hilfe und gemeinsame Geraeteadresse');
  const replies = [];
  selection.start([{ portId: 'test-1', portName: 'COM7', displayName: 'Simulierter Adapter' }], (v) => replies.push(v));
  await wait("document.querySelector('#desktopPortDialog').classList.contains('show')");
  assert.equal(await run("window.registerwerkPrepareUpdate()"), false);
  assert.equal(await run("document.querySelector('#desktopPortConnect').disabled"), true);
  await run("document.querySelector('#desktopPortList input').click(); document.querySelector('#desktopPortConnect').click()");
  await wait("!document.querySelector('#desktopPortDialog').classList.contains('show')");
  assert.deepEqual(replies, ['test-1']);
  selection.start([], (v) => replies.push(v));
  await wait("document.querySelector('#desktopPortDialog').classList.contains('show')");
  await run("document.querySelector('#desktopPortCancel').click()");
  await wait("!document.querySelector('#desktopPortDialog').classList.contains('show')");
  assert.deepEqual(replies, ['test-1', '']);
  console.log('PASS Portauswahl ueber echte Electron-IPC und Abbruch ohne Port');
  await run("document.querySelector('#connect').click()");
  await wait("document.querySelector('#desktopPortDialog').classList.contains('show')");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await wait("!document.querySelector('#desktopPortDialog').classList.contains('show')");
  await wait("document.querySelector('#headStatus').textContent === 'Nicht verbunden'");
  console.log('PASS Echtes navigator.serial.requestPort erreicht Portauswahl; Escape bricht ab');
  const output = path.join(app.getPath('userData'), 'smoke-export.json');
  const downloaded = new Promise((resolve, reject) => {
    ses.once('will-download', (_event, item) => {
      item.setSavePath(output);
      item.once('done', (_done, state) => state === 'completed' ? resolve() : reject(new Error(state)));
    });
  });
  await run("document.querySelector('#saveProject').click(); document.querySelector('#confirmExport').click()");
  await downloaded;
  const exported = JSON.parse(await fs.readFile(output, 'utf8'));
  assert.equal(exported.settings.sameDeviceAddress, true);
  assert.equal(exported.points.length, 2);
  assert(exported.points.every((p) => p.device === 17));
  console.log('PASS JSON-Export ueber Electron-Download');
  await run("new Promise(resolve => setTimeout(resolve, 650))");
  await window.loadURL(appUrl);
  await wait("document.querySelectorAll('#pointRows tr').length === 2");
  assert.deepEqual(await run("[...document.querySelectorAll('.device-input')].map(e => e.value)"), ['17', '17']);
  console.log('PASS Wiederherstellung nach Neuladen unter stabiler App-Adresse');
  await run(`{
    const project = {format:'registerwerk-modbus-rtu', version:3, points:[
      {name:'Import A', device:3, func:'03', address:10, format:'UINT16'},
      {name:'Import B', device:4, func:'04', address:20, format:'INT16'}
    ]};
    const data = new DataTransfer();
    data.items.add(new File([JSON.stringify(project)], 'desktop-test.json', {type:'application/json'}));
    const field = document.querySelector('#projectFile');
    field.files = data.files; field.dispatchEvent(new Event('change'));
  }`);
  await wait("document.querySelector('.name-input').value === 'Import A'");
  assert.deepEqual(await run("[...document.querySelectorAll('.device-input')].map(e => e.value)"), ['3', '4']);
  assert.equal(await run("document.querySelector('#sameDeviceAddress').checked"), false);
  console.log('PASS Projektimport ueber File-API erhaelt getrennte Geraeteadressen');
};
