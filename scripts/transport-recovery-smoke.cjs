'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');

function rtu(bytes) {
  let crc = 65535;
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1; }
  return Buffer.from([...bytes, crc & 255, crc >> 8]);
}
module.exports = async ({ window, appUrl }) => {
  const run = code => window.webContents.executeJavaScript(code, true);
  const wait = async code => {
    const end = Date.now() + 10000;
    while (Date.now() < end) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw Error('Transport-Recovery: ' + code);
  };
  const load = async project => {
    await run(`{const d=new DataTransfer();d.items.add(new File([${JSON.stringify(JSON.stringify(project))}],'recovery.json'));const f=document.querySelector('#projectFile');f.files=d.files;f.dispatchEvent(new Event('change'));}`);
    await wait(`document.querySelector('.name-input')?.value === ${JSON.stringify(project.points[0].name)}`);
  };
  const point = (name, device, address = 0) => ({ name, device, address, func: '03', format: 'UINT16' });
  for (const mode of ['tcp', 'ethRtu']) {
    const sockets = new Set(), seen = []; let connections = 0;
    const server = net.createServer(socket => {
      sockets.add(socket); connections++;
      socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
      let buffer = Buffer.alloc(0);
      socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 8) {
          const size = mode === 'tcp' ? buffer.readUInt16BE(4) + 6 : 8;
          if (buffer.length < size) return;
          const req = buffer.subarray(0, size); buffer = buffer.subarray(size);
          const unit = req[mode === 'tcp' ? 6 : 0], fc = req[mode === 'tcp' ? 7 : 1];
          seen.push(unit);
          if (unit === 1) continue;
          const body = [unit, fc, 2, 0, 42];
          socket.write(mode === 'tcp' ? Buffer.from([req[0], req[1], 0, 0, 0, body.length, ...body]) : rtu(body));
        }
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await window.loadURL(appUrl); await wait('!!window.registerwerkUI');
      const project = { format: 'registerwerk-modbus-rtu', version: 3,
        settings: { transport: mode, tcpHost: '127.0.0.1', tcpPort: server.address().port, timeout: 100, guard: 50, pollDelay: 0, roundDelay: 100, skipErrors: true },
        points: [point('Stiller Teilnehmer', 1), point('Gesunder Teilnehmer', 2)] };
      await load(project);
      await run("window.registerwerkNavigate('connection');document.querySelector('#connect').click()");
      await wait('window.registerwerkUI.snapshot().connected');
      await run("window.registerwerkNavigate('points');document.querySelector('#start').click()");
      await wait("document.querySelectorAll('.value-cell')[1]?.textContent==='42.00'");
      await new Promise(resolve => setTimeout(resolve, 400));
      assert.equal(await run('window.registerwerkUI.snapshot().running && window.registerwerkUI.snapshot().connected'), true);
      assert.equal(seen.filter(x => x === 1).length, 1, 'silent device receives backoff');
      assert(seen.filter(x => x === 2).length >= 2, 'healthy device keeps polling');
      assert.equal(connections, 1, 'no hidden reconnect');
      await run("document.querySelector('#stop').click()"); await wait('!window.registerwerkUI.snapshot().running');
      await run("document.querySelector('#skipErrors').checked=false;document.querySelector('#start').click()");
      await wait('!window.registerwerkUI.snapshot().running');
      assert.equal(await run('window.registerwerkUI.snapshot().connected'), true);
      await run("document.querySelector('#disconnect').click()"); await wait('!window.registerwerkUI.snapshot().connected');
      console.log(`PASS ${mode}: Messlauf mit stillem Teilnehmer, Backoff, gesunde Werte, Stoppen bei deaktiviertem Überspringen ohne Socketverlust`);

      if (mode === 'tcp') {
        // Import must validate using project transport even while the UI is set to RTU.
        await run("document.querySelector('#transport').value='rtu';document.querySelector('#transport').dispatchEvent(new Event('change'))");
        await load({ ...project, settings: { ...project.settings, scanFrom: 0, scanTo: 255 }, points: [point('Unit Null', 0), point('Unit 255', 255)] });
        assert.deepEqual(await run("[...document.querySelectorAll('.device-input')].map(x=>[x.value,x.min,x.max])"), [['0', '0', '255'], ['255', '0', '255']]);
        await run("document.querySelector('#sameDeviceAddress').click()");
        assert.deepEqual(await run('window.registerwerkUI.snapshot().devices'), [0]);
        await run("document.querySelector('#sameDeviceAddress').click();const input=document.querySelectorAll('.device-input')[1];input.value='255';input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#connect').click()");
        await wait('window.registerwerkUI.snapshot().connected');
        await run("document.querySelector('#readOnce').click()"); await wait('!window.registerwerkUI.snapshot().running');
        assert.deepEqual(await run("[...document.querySelectorAll('.value-cell')].map(x=>x.textContent)"), ['42.00', '42.00']);
        for (const unit of [0, 255]) {
          await run(`window.registerwerkNavigate('scan');document.querySelector('#scanFrom').value='${unit}';document.querySelector('#scanTo').value='${unit}';document.querySelector('#startScan').click()`);
          await wait('!window.registerwerkUI.snapshot().scanning');
          assert.match(await run("document.querySelector('#scanSummary').textContent"), /1 antwortend/);
          await run(`window.registerwerkNavigate('registers');document.querySelector('#blockDevice').value='${unit}';document.querySelector('#blockCount').value='1';document.querySelector('#readBlock').click()`);
          await wait('!window.registerwerkUI.snapshot().blockReading');
          assert.match(await run("document.querySelector('#blockRows').textContent"), /42/);
        }
        await run("document.querySelector('#disconnect').click()"); await wait('!window.registerwerkUI.snapshot().connected');
        await run("document.querySelector('#transport').value='ethRtu';document.querySelector('#transport').dispatchEvent(new Event('change'))");
        assert.deepEqual(await run("[...document.querySelectorAll('.device-input')].map(x=>[x.value,x.min,x.max,x.validity.valid])"), [['0', '1', '247', false], ['255', '1', '247', false]]);
        assert.equal(await run("document.querySelector('#writeDevice').max"), '247');
        console.log('PASS TCP Unit-ID 0/255: Import, gemeinsame Adresse, Lesen, Scan, Bereichsabfrage und RTU-Moduswechsel ohne heimliche Adressänderung');
      }
    } finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
  }
};
