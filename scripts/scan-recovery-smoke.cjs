'use strict';
const assert=require('node:assert/strict'),net=require('node:net');
const crc=buf=>{let v=65535;for(const b of buf){v^=b;for(let i=0;i<8;i++)v=v&1?(v>>>1)^0xa001:v>>>1}return v};
function frame(bytes,corrupt=false){const c=crc(bytes);return Buffer.from([...bytes,c&255,(c>>8)^(corrupt?1:0)])}
module.exports=async({window,appUrl})=>{
 const run=c=>window.webContents.executeJavaScript(c,true);
 const wait=async c=>{const end=Date.now()+15000;while(Date.now()<end){if(await run(c))return;await new Promise(r=>setTimeout(r,25))}throw Error('Scan-Test: '+c)};
 for(const mode of ['ethRtu','tcp']){
  let connects=0;const server=net.createServer(sock=>{connects++;let data=Buffer.alloc(0);
   if(mode==='ethRtu'&&connects===2)setTimeout(()=>{if(!sock.destroyed)sock.write(frame([1,3,2,0,5]));},100);
   sock.on('data',chunk=>{data=Buffer.concat([data,chunk]);for(;;){const len=mode==='tcp'?(data.length>=6?6+data.readUInt16BE(4):0):8;if(!len||data.length<len)return;const req=data.subarray(0,len);data=data.subarray(len);const unit=mode==='tcp'?req[6]:req[0];if(unit===1)continue;
    let response;if(mode==='tcp'){const body=unit===3?[unit,0x83,2]:[unit,3,2,0,42];response=Buffer.from([req[0],req[1],0,0,0,body.length,...body]);}
    else {const body=unit===4?[unit,0x83,2]:[unit===5?9:unit,unit===6?4:3,2,0,42];response=frame(body,unit===3);}
    sock.write(response.subarray(0,3));setTimeout(()=>{if(!sock.destroyed)sock.write(response.subarray(3))},5);
   }});
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  try {
   await window.loadURL(appUrl);await wait("!!document.querySelector('#projectFile')");
   const p={format:'registerwerk-modbus-rtu',version:3,settings:{transport:mode,tcpHost:'127.0.0.1',tcpPort:server.address().port,scanTimeout:100,scanFrom:1,scanTo:mode==='tcp'?3:6,scanFunctions:['03']},points:[]};
   await run(`{const t=new DataTransfer();t.items.add(new File([${JSON.stringify(JSON.stringify(p))}],'scan.json',{type:'application/json'}));const f=document.querySelector('#projectFile');f.files=t.files;f.dispatchEvent(new Event('change'));}`);
   await wait(`document.querySelector('#transport').value===${JSON.stringify(mode)}`);await run("document.querySelector('#connect').click()");await wait("document.querySelector('#headStatus').textContent==='Verbunden'");
   await run("document.querySelector('#openScan').click();document.querySelector('#startScan').click()");await wait(`document.querySelector('#scanProgressText').textContent===${JSON.stringify(mode==='tcp'?'3 / 3':'6 / 6')}`);await wait("document.querySelector('#stopScan').classList.contains('hidden')");
   const summary=await run("document.querySelector('#scanSummary').textContent"),rows=await run("[...document.querySelectorAll('#scanRows tr')].map(x=>x.textContent)");
   assert.match(summary,/2 antwortend/);assert.match(summary,/1 ohne rechtzeitige Antwort/);assert.match(summary,mode==='tcp'?/0 Prüffehler/:/3 Prüffehler/);assert(!summary.includes('Abgebrochen'));assert(connects>=2);
   assert(rows.some(x=>x.includes('Ausnahme')));
   if(mode==='ethRtu'){assert(rows.some(x=>x.includes('CRC ungültig')));assert(rows.some(x=>x.includes('statt 5')));assert(rows.some(x=>x.includes('Funktionscode')));}
   assert.equal(await run("document.querySelector('#headStatus').textContent"),'Verbunden');await run("document.querySelector('#disconnect').click()");await wait("document.querySelector('#headStatus').textContent==='Nicht verbunden'");
   console.log('PASS '+mode+': Scan nach Timeout, Wiederverbinden, gültige/ungültige Antworten und Modbus-Ausnahme');
  } finally {server.close();}
 }
};
