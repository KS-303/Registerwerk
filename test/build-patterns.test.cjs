'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { FileMatcher } = require('app-builder-lib/out/fileMatcher');
const root = path.resolve(__dirname, '..');
const file = { isDirectory: () => false };

test('Buildfilter nimmt App-Dateien auf und lässt private Unterlagen und Tests weg', () => {
  const filter = new FileMatcher(root, '/unused', s => s, require('../package.json').build.files).createFilter();
  for (const name of ['desktop/main.cjs', 'desktop/modbus-transport.cjs', 'renderer/app.js', 'renderer/index.html', 'build/icon.png', 'package.json']) {
    assert.equal(filter(path.join(root, name), file), true, name);
  }
  for (const name of ['privat/bericht.md', '.github/workflows/windows.yml', 'test/modbus-transport.test.cjs', 'node_modules/minimatch/package.json', 'source/Registerwerk.html']) {
    assert.equal(filter(path.join(root, name), file), false, name);
  }
});

test('Buildfilter behandelt Ausschlüsse und verschachtelte Verzeichnisse korrekt', () => {
  const filter = new FileMatcher(root, '/unused', s => s, ['renderer/**/*', '!renderer/**/*.map']).createFilter();
  assert.equal(filter(path.join(root, 'renderer/sub/app.js'), file), true);
  assert.equal(filter(path.join(root, 'renderer/sub/app.js.map'), file), false);
  assert.equal(filter(path.join(root, 'renderer/.hidden.css'), file), true);
});

test('Universal-Build kann die benötigte minimatch-API weiterhin verwenden', () => {
  const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
  const universalRequire = createRequire(builderRequire.resolve('@electron/universal/package.json'));
  const { minimatch } = universalRequire('minimatch');
  assert.equal(minimatch('resources/native/addon.node', '*.node', { matchBase: true }), true);
  assert.equal(minimatch('resources/native/addon.js', '*.node', { matchBase: true }), false);
  assert.equal(minimatch('Contents/Info.plist', '**/Info.plist', { matchBase: true }), true);
});
