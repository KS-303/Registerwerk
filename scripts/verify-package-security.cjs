'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
// Resolve the same tools electron-builder uses, including with nested npm installs.
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
const { getCurrentFuseWire, FuseV1Options } = builderRequire('@electron/fuses');
const { NtExecutable, NtExecutableResource } = builderRequire('resedit');
const asar = builderRequire('@electron/asar');

async function verifyPackage(directory) {
  const exe = path.join(directory, 'Registerwerk.exe');
  const archive = path.join(directory, 'resources', 'app.asar');
  assert.ok(fs.existsSync(exe), 'Registerwerk.exe fehlt. Zuerst Windows-App bauen.');
  assert.ok(fs.existsSync(archive), 'resources/app.asar fehlt.');
  const actual = await getCurrentFuseWire(exe);
  const expected = {
    RunAsNode: false,
    EnableNodeOptionsEnvironmentVariable: false,
    EnableNodeCliInspectArguments: false,
    EnableEmbeddedAsarIntegrityValidation: true,
    OnlyLoadAppFromAsar: true,
    GrantFileProtocolExtraPrivileges: false,
  };
  for (const [name, enabled] of Object.entries(expected)) {
    // Fuse wire states are the ASCII bytes '0' and '1'.
    assert.equal(actual[FuseV1Options[name]], enabled ? 49 : 48, `Electron-Schutz fehlt: ${name}`);
  }
  const pe = NtExecutable.from(fs.readFileSync(exe));
  const resources = NtExecutableResource.from(pe);
  const entries = resources.entries.filter(r => r.type === 'INTEGRITY' && r.id === 'ELECTRONASAR');
  assert.equal(entries.length, 1, 'Eindeutiger ASAR-Pruefwert fehlt in der EXE.');
  const hashes = JSON.parse(Buffer.from(entries[0].bin).toString('utf8'));
  const entry = hashes.find(h => h.file.replaceAll('\\', '/') === 'resources/app.asar');
  assert.ok(entry, 'ASAR-Pruefwert gehoert nicht zu resources/app.asar.');
  assert.equal(entry.alg, 'SHA256', 'Unerwarteter ASAR-Pruefalgorithmus.');
  const { headerString } = asar.getRawHeader(archive);
  assert.equal(entry.value, createHash('sha256').update(headerString).digest('hex'), 'ASAR-Header und EXE passen nicht zusammen.');
  const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
  assert.equal(packed.version, require('../package.json').version, 'Gepackte App hat eine abweichende Version.');
  console.log(`PAKETSCHUTZ OK: Registerwerk ${packed.version}, 6 Electron-Fuses und ASAR-Header geprueft.`);
}

if (require.main === module) {
  verifyPackage(path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'win-unpacked')))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { verifyPackage };
