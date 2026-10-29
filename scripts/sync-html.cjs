'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'source', 'Registerwerk.html'), 'utf8');
const styles = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)];
const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (styles.length !== 1 || scripts.length !== 1) {
  throw new Error('Die Quelldatei muss genau einen Style- und einen Script-Block enthalten.');
}
new Function(scripts[0][1]);
const output = path.join(root, 'renderer');
fs.mkdirSync(output, { recursive: true });
const html = source
  .replace(styles[0][0], '<link rel="stylesheet" href="app.css"><link rel="stylesheet" href="desktop.css">')
  .replace(scripts[0][0], '<script src="app.js" defer></script><script src="desktop-ui.js" defer></script>');
fs.writeFileSync(path.join(output, 'index.html'), html);
fs.writeFileSync(path.join(output, 'app.css'), styles[0][1]);
fs.writeFileSync(path.join(output, 'app.js'), scripts[0][1]);
console.log('Registerwerk-Oberflaeche und Renderer aus der Quelldatei aktualisiert.');
