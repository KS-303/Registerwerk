'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'registerwerk-smoke-'));
const env = { ...process.env, REGISTERWERK_SMOKE_DATA: temporary };
delete env.ELECTRON_RUN_AS_NODE;
const args = [root, '--smoke-test'];
// The QA container runs as root; this flag is never part of the Windows build.
if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox');
if (process.platform === 'linux' && !process.env.DISPLAY) args.push('--ozone-platform=headless', '--disable-gpu');
const child = spawn(require('electron'), args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (bytes) => { output += bytes; process.stdout.write(bytes); });
child.stderr.on('data', (bytes) => process.stderr.write(bytes));
const timer = setTimeout(() => child.kill(), 45000);
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('close', (code) => {
  clearTimeout(timer);
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  process.exitCode = code === 0 && output.includes('REGISTERWERK_SMOKE_PASS') ? 0 : 1;
});
