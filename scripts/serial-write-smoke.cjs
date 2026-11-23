'use strict';
const assert = require('node:assert/strict');

module.exports = async ({ window, appUrl }) => {
  const run = code => window.webContents.executeJavaScript(code, true);
  const wait = async expression => {
    const until = Date.now() + 12000;
    while (Date.now() < until) {
      if (await run(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error('USB-RTU-Simulation: ' + expression);
  };
  await window.loadURL(appUrl);
  await wait('!!window.registerwerkNavigate');
  await run(`(() => {
    const crc = bytes => { let c=65535; for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xa001:c>>>1;}return c; };
    const frame = bytes => { const c=crc(bytes);return Uint8Array.from([...bytes,c&255,c>>8]); };
    const values = new Map(), coils = new Map();
    const port = { readable:null, writable:null, async open() {
      this.readable = new ReadableStream({start(controller){port.rx=controller;}});
      this.writable = {getWriter(){return {async write(bytes){
        const request=Uint8Array.from(bytes),fc=request[1],addr=(request[2]<<8)|request[3],qty=(request[4]<<8)|request[5];
        if(port.failNext){port.failNext=false;throw Error('Simulierter Sendefehler');}
        port.wires.push([...request]);
        let response;
        if(fc===5){coils.set(addr,qty===65280?1:0);response=frame([...request.slice(0,6)]);}
        else if(fc===6){values.set(addr,qty);response=frame([...request.slice(0,6)]);}
        else if(fc===15){for(let i=0;i<qty;i++)coils.set(addr+i,(request[7+(i>>3)]>>(i%8))&1);response=frame([...request.slice(0,6)]);}
        else if(fc===16){for(let i=0;i<qty;i++)values.set(addr+i,(request[7+i*2]<<8)|request[8+i*2]);response=frame([...request.slice(0,6)]);}
        else if(fc===1){let b=0;for(let i=0;i<qty;i++)b|=(coils.get(addr+i)||0)<<i;response=frame([1,1,1,b]);}
        else {const words=[];for(let i=0;i<qty;i++){const v=values.get(addr+i)||0;words.push(v>>8,v&255);}response=frame([1,3,words.length,...words]);}
        queueMicrotask(()=>port.rx.enqueue(response));
      },releaseLock(){}}}};
    }, async close(){this.rx?.close();}, wires:[], failNext:false };
    window.__serialPort=port;
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port},configurable:true});
  })()`);
  await run("window.registerwerkNavigate('settings');if(document.querySelector('#prefReadOnly').checked)document.querySelector('#prefReadOnly').click();");
  await wait('!window.registerwerkUI.snapshot().readOnly');
  await run("window.registerwerkNavigate('connection');document.querySelector('#transport').value='rtu';document.querySelector('#transport').dispatchEvent(new Event('change'));document.querySelector('#connect').click()");
  await wait('window.registerwerkUI.snapshot().connected');
  const cases = [['05','1',0],['06','4660',1],['15','1; 0; 1',2],['16','1; 2',5]];
  for (const [fc,value,address] of cases) {
    await run(`window.registerwerkNavigate('registers');document.querySelector('#openWrite').click();document.querySelector('#writeDevice').value='1';document.querySelector('#writeFunction').value='${fc}';document.querySelector('#writeFunction').dispatchEvent(new Event('change'));document.querySelector('#writeFormat').value='UINT16';document.querySelector('#writeAddress').value='${address}';document.querySelector('#writeValues').value=${JSON.stringify(value)};document.querySelector('#previewWrite').click();`);
    assert.equal(await run("document.querySelector('#confirmWrite').classList.contains('show')"),true);
    const before=await run('window.__serialPort.wires.length');
    await run("document.querySelector('#doWrite').click()");
    await wait('!window.registerwerkUI.snapshot().writing');
    const wires=await run('window.__serialPort.wires');
    assert.equal(wires.length,before+2,'one write followed by one independent read');
    const raw=wires[before].map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
    const lines=await run("[...document.querySelectorAll('#log [data-write-evidence]')].map(x=>x.textContent)");
    assert(lines.some(line=>line.includes('TX · USB-RTU')&&line.includes('FC '+fc)&&line.includes(raw)));
    assert(lines.some(line=>line.includes('RX ·')&&line.includes('CRC OK')));
    assert.match(await run("document.querySelector('#log').textContent"),/Rückleseprüfung erfolgreich/);
    if(fc==='05')assert.deepEqual(wires[before],[1,5,0,0,255,0,140,58]);
  }
  const before=await run("({wires:window.__serialPort.wires.length,tx:document.querySelectorAll('#log [data-write-evidence]').length})");
  await run("window.__serialPort.failNext=true;document.querySelector('#openWrite').click();document.querySelector('#writeDevice').value='1';document.querySelector('#writeFunction').value='05';document.querySelector('#writeFunction').dispatchEvent(new Event('change'));document.querySelector('#writeAddress').value='8';document.querySelector('#writeValues').value='1';document.querySelector('#previewWrite').click();document.querySelector('#doWrite').click()");
  await wait('!window.registerwerkUI.snapshot().writing');
  assert.equal(await run('window.__serialPort.wires.length'),before.wires);
  assert.equal(await run("document.querySelectorAll('#log [data-write-evidence]').length"),before.tx);
  assert.match(await run("document.querySelector('#topError').textContent"),/Senden fehlgeschlagen/);
  await run("document.querySelector('#disconnect').click()");
  await wait('!window.registerwerkUI.snapshot().connected');
  console.log('PASS USB-RTU: FC05/06/15/16 TX, RX, Readback und kein TX bei fehlgeschlagenem Senden');
};
