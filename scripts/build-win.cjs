'use strict';
const { build, Platform, Arch } = require('electron-builder');
const path = require('node:path');

build({
  projectDir: path.resolve(__dirname, '..'),
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: {
    forceCodeSigning: false,
    cscLink: null,
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      verifyUpdateCodeSignature: false,
      signAndEditExecutable: true,
    },
  },
}).catch(error => {
  console.error(error.message);
  // Builder cleanup can reset exitCode. A failed build must stop the CI job.
  process.exit(1);
});
