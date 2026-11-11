'use strict';
const assert=require('node:assert/strict');
const net=require('node:net');
module.exports=async({window,appUrl})=>{
 const run=(code)=>window.webContents.executeJavaScript(code,true);
 const wait=async(code)=>{const end=Date.now()+10000;while(Date.now()<end){if(await run(code))return;await new Promise(r=>setTimeout(r,30));}throw Error('Diagnose-Wartebedingung: '+code)};
 const server=net.createServer(socket=>{let data=Buffer.alloc(0);socket.on('data',chunk=>{data=Buffer.concat([data,chunk]);while(data.length>=8){const len=6+data.readUInt16BE(4);if(data.length<len)return;const req=data.subarray(0,len);data=data.subarray(len);const addr=req.readUInt16BE(8),head=[req[0],req[1],0,0];if(addr===102)continue;const resp=addr===101?Buffer.from([...head,0,3,req[6],req[7]|128,2]):Buffer.from([...head,0,5,req[6],req[7],2,4,210]);socket.write(resp.subarray(0,4));setTimeout(()=>socket.write(resp.subarray(4)),5);}});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try {
  await window.loadURL(appUrl);await wait("!!document.querySelector('#projectFile')");
  const project={format:'registerwerk-modbus-rtu',version:3,settings:{transport:'tcp',tcpHost:'127.0.0.1',tcpPort:server.address().port,timeout:200,pollDelay:0},points:[{name:'OK',device:1,func:'03',address:100,format:'UINT16',scale:0.1},{name:'Ausnahme',device:1,func:'03',address:101,format:'UINT16'},{name:'Timeout',device:1,func:'03',address:102,format:'UINT16'}]};
  await run(`{const t=new DataTransfer();t.items.add(new File([${JSON.stringify(JSON.stringify(project))}],'diagnose.json',{type:'application/json'}));const f=document.querySelector('#projectFile');f.files=t.files;f.dispatchEvent(new Event('change'));}`);
  await wait("document.querySelector('.name-input')?.value==='OK'");await run("document.querySelector('#connect').click()");await wait("document.querySelector('#headStatus').textContent==='Verbunden'");
  await run("document.querySelector('#openDiagnostics').click();document.querySelector('#readOnce').click()");
  await wait('!window.registerwerkUI.snapshot().running');assert.equal(await run('window.registerwerkUI.snapshot().connected'),true);
  await wait("document.querySelectorAll('#diagRows tr').length===3 && document.querySelectorAll('#diagRows tr')[2].children[4].textContent==='1'");
  assert.deepEqual(await run("[...document.querySelectorAll('#diagRows tr')].map(r=>[...r.children].slice(1,8).map(c=>c.textContent))"),[['1','1','100.0 %','0','0','0','0'],['1','0','0.0 %','0','1','0','0'],['1','0','0.0 %','1','0','0','0']]);
  await run("document.querySelector('#trendChoices input').click()");
  assert.match(await run("document.querySelector('#trendHint').textContent"),/OK/);
  assert.equal(await run("document.querySelector('.value-cell').textContent"),'123.40');
  console.log('PASS TCP über echten lokalen Server: fragmentierte Antwort, Modbus-Ausnahme, Timeout, Status, Statistik und Trend');
  if(process.env.REGISTERWERK_DIAG_SCREENSHOT) {await run("document.querySelector('#diagnosticsPanel').scrollIntoView({block:'start'})");await new Promise(r=>setTimeout(r,100));await require('node:fs/promises').writeFile(process.env.REGISTERWERK_DIAG_SCREENSHOT,(await window.capturePage()).toPNG());}
  await run("document.querySelector('#checkAddresses').click()");assert.match(await run("document.querySelector('#addressResults').textContent"),/Keine Überschneidungen/);
  await run("document.querySelector('#disconnect').click()");await wait('!window.registerwerkUI.snapshot().connected');
  const changed={...project,points:[{name:'32 Bit',device:1,func:'03',address:100,format:'UINT32 ABCD'},{name:'16 Bit',device:1,func:'03',address:101,format:'UINT16'},{name:'Andere Geräteadresse',device:2,func:'03',address:100,format:'UINT16'},{name:'Bit 0',device:1,func:'04',address:22,format:'BOOL',bit:0},{name:'Bit 1',device:1,func:'04',address:22,format:'BOOL',bit:1}]};
  await run(`{const t=new DataTransfer();t.items.add(new File([${JSON.stringify(JSON.stringify(changed))}],'adresse.json',{type:'application/json'}));const f=document.querySelector('#projectFile');f.files=t.files;f.dispatchEvent(new Event('change'));}`);await wait("document.querySelector('.name-input')?.value==='32 Bit'");
  await run("document.querySelector('#checkAddresses').click()");const text=await run("document.querySelector('#addressResults').textContent");assert.match(text,/überlappender Adressbereich/);assert.match(text,/unterschiedliche Bits/);assert(!text.includes('Andere Geräteadresse'));
  console.log('PASS Adressprüfung: 32-/16-Bit-Überlappung, getrennte Geräte und unterschiedliche Bits');
  await run("window.confirm=()=>true;document.querySelector('#resetDiagnostics').click()");assert.equal(await run("[...document.querySelectorAll('#diagRows tr')].every(r=>r.children[1].textContent==='0')"),true);
  console.log('PASS Statistik und Trend zurücksetzen');
 } finally {server.close();}
};
