'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateController } = require('../desktop/updater.cjs');
function setup(overrides = {}) {
  const updater = new EventEmitter();
  const calls = [];
  updater.setFeedURL = (value) => calls.push(['feed', value]);
  updater.checkForUpdates = async () => { calls.push('check'); updater.emit('update-available', { version: '0.1.2' }); };
  updater.downloadUpdate = async () => { calls.push('download'); updater.emit('update-downloaded', { version: '0.1.2' }); };
  updater.quitAndInstall = (...args) => calls.push(['install', ...args]);
  const options = { updater, version: '0.1.1', mode: 'installed', notify: () => {},
    canInstall: async () => true, prepare: async () => true, rollback: () => calls.push('rollback'),
    confirm: async () => true, schedule: (fn) => fn(), ...overrides };
  return { updater, calls, controller: new UpdateController(options) };
}
test('Prüfung lädt nichts automatisch und Schließen installiert nichts automatisch', async () => {
  const { updater, calls, controller } = setup();
  assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false);
  await controller.check(); assert.equal(controller.snapshot().phase, 'available');
  assert(!calls.includes('download')); assert(!calls.some((x) => Array.isArray(x) && x[0] === 'install'));
});
test('Download und Installation benötigen getrennte Aktionen', async () => {
  const { calls, controller } = setup();
  await controller.install(); assert.equal(controller.snapshot().phase, 'idle');
  await controller.check(); await controller.download();
  assert.equal(controller.snapshot().phase, 'ready');
  await controller.install(); await controller.install();
  assert.deepEqual(calls.filter((x) => Array.isArray(x) && x[0] === 'install'), [['install', false, true]]);
});
test('Aktive Kommunikation blockiert Installation vor der Bestätigung', async () => {
  const { calls, controller } = setup({ canInstall: async () => false, confirm: () => { throw Error('Darf nicht gefragt werden'); } });
  await controller.check(); await controller.download(); await controller.install();
  assert.equal(controller.snapshot().phase, 'ready'); assert(controller.snapshot().message.includes('gesperrt'));
  assert(!calls.some((x) => Array.isArray(x) && x[0] === 'install'));
});
test('Beginnende Kommunikation während der Bestätigung wird erneut geprüft', async () => {
  const { calls, controller } = setup({ prepare: async () => false });
  await controller.check(); await controller.download(); await controller.install();
  assert.equal(controller.snapshot().phase, 'ready');
  assert(!calls.some((x) => Array.isArray(x) && x[0] === 'install'));
});
test('Abbrechen der Bestätigung bewahrt heruntergeladenes Update', async () => {
  const { controller } = setup({ confirm: async () => false });
  await controller.check(); await controller.download(); await controller.install();
  assert.equal(controller.snapshot().phase, 'ready');
});
test('Portable und Ordner-Ausgaben installieren nicht automatisch', async () => {
  for (const mode of ['portable', 'folder', 'development']) {
    const { calls, controller } = setup({ mode });
    await controller.check(); await controller.download(); await controller.install();
    assert.equal(controller.snapshot().supported, false); assert.deepEqual(calls, []);
  }
});
test('Fehler werden angezeigt und eine erneute Prüfung ist möglich', async () => {
  const { updater, controller } = setup();
  updater.checkForUpdates = async () => { throw Object.assign(Error('keine Release'), { code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' }); };
  await controller.check(); assert.equal(controller.snapshot().phase, 'error');
  assert(controller.snapshot().message.includes('noch keine'));
  updater.checkForUpdates = async () => updater.emit('update-not-available');
  await controller.check(); assert.equal(controller.snapshot().phase, 'latest');
});
