'use strict';
const assert=require('node:assert/strict'),net=require('node:net');
const crc=buf=>{let v=65535;for(const b of buf){v^=b;for(let i=0;i<8;i++)v=v&1?(v>>>1)^0xa001:v>>>1;}return v;};
const frame=buf=>{const c=crc(buf);return Buffer.from([...buf,c&255,c>>8]);};
module.exports=async({window,appUrl})=>{
 const run=c=>window.webContents.executeJavaScript(c,true);
 const wait=async c=>{const end=Date.now()+12000;while(Date.now()<end){if(await run(c))return;await new Promise(r=>setTimeout(r,20));}throw Error('Kommunikation: '+c);};
 const importProject=async p=>{await run(`{const d=new DataTransfer();d.items.add(new File([${JSON.stringify(JSON.stringify(p))}],'matrix.json'));const f=document.querySelector('#projectFile');f.files=d.files;f.dispatchEvent(new Event('change'));}`);await wait(`document.querySelectorAll('#pointRows tr').length===${p.points.length}`);};
 for(const mode of ['tcp','ethRtu']){
  const regs=new Map(),coils=new Map(),writes=[];let requests=0;const sockets=new Set();
  const server=net.createServer(sock=>{sockets.add(sock);sock.on('close',()=>sockets.delete(sock));let data=Buffer.alloc(0);sock.on('data',chunk=>{data=Buffer.concat([data,chunk]);for(;;){
   if(data.length<8)return;const fc=mode==='tcp'?data[7]:data[1];const n=mode==='tcp'?6+data.readUInt16BE(4):[15,16].includes(fc)?(data.length>=7?9+data[6]:0):8;
   if(!n||data.length<n)return;const req=data.subarray(0,n);data=data.subarray(n);const r=mode==='tcp'?req.subarray(6):req.subarray(0,-2);const addr=r.readUInt16BE(2),qty=r.readUInt16BE(4);requests++;
   if([5,6,15,16].includes(fc))writes.push({fc,addr});
   if(addr===62000)continue;
   if(addr===65000){sock.write(Buffer.alloc(5000,255));continue;}
   if(addr===65002){sock.destroy();return;}
   let body;
   if([1,2].includes(fc)){const out=Buffer.alloc(Math.ceil(qty/8));for(let i=0;i<qty;i++)if(coils.get(addr+i))out[i>>3]|=1<<(i%8);body=Buffer.from([r[0],fc,out.length,...out]);}
   else if([3,4].includes(fc)){const out=[];for(let i=0;i<qty;i++){const v=regs.get(addr+i)||0;out.push(v>>8,v&255);}body=Buffer.from([r[0],fc,out.length,...out]);}
   else if(fc===5){coils.set(addr,qty===65280?1:0);body=r.subarray(0,6);}
   else if(fc===6){regs.set(addr,qty);body=r.subarray(0,6);}
   else if(fc===15){for(let i=0;i<qty;i++)coils.set(addr+i,(r[7+(i>>3)]>>(i%8))&1);body=r.subarray(0,6);}
   else if(fc===16){for(let i=0;i<qty;i++)regs.set(addr+i,r.readUInt16BE(7+i*2));body=r.subarray(0,6);}
   const response=mode==='tcp'?Buffer.from([req[0],addr===65001?(req[1]+1)&255:req[1],0,0,0,body.length,...body]):frame(body);
   sock.write(response.subarray(0,3));setTimeout(()=>{if(!sock.destroyed)sock.write(response.subarray(3));},8);
  }});});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
   const points=[],expected=[];let addr=100;
   function point(format,bytes,val,extra={}){for(let i=0;i<bytes.length;i+=2)regs.set(addr+i/2,(bytes[i]<<8)|bytes[i+1]);points.push({name:format,device:1,func:'03',address:addr,format,decimals:2,...extra});expected.push(val);addr+=3;}
   point('UINT16',[4,210],'123.40',{scale:.1});point('INT16',[255,133],'-123.00');point('HEX16',[0x12,0x34],'0x1234');point('BOOL',[0,4],'Ein',{bit:2});
   for(const type of ['UINT32','INT32','FLOAT32'])for(const order of ['ABCD','BADC','CDAB','DCBA']){const b=Buffer.alloc(4);if(type==='UINT32')b.writeUInt32BE(123456);if(type==='INT32')b.writeInt32BE(-123456);if(type==='FLOAT32')b.writeFloatBE(12.5);const ix={ABCD:[0,1,2,3],BADC:[1,0,3,2],CDAB:[2,3,0,1],DCBA:[3,2,1,0]}[order];point(type+' '+order,ix.map(i=>b[i]),type==='FLOAT32'?'12.50':type==='INT32'?'-123456.00':'123456.00');}
   for(const fc of ['01','02']){coils.set(addr,1);points.push({name:'Bit '+fc,device:1,func:fc,address:addr++,format:'BOOL'});expected.push('Ein');}
   const p={format:'registerwerk-modbus-rtu',version:3,settings:{transport:mode,tcpHost:'127.0.0.1',tcpPort:server.address().port,timeout:200,pollDelay:0,roundDelay:100},points};
   await window.loadURL(appUrl);await wait('!!window.registerwerkNavigate');await importProject(p);await wait("document.querySelector('.name-input').value==='UINT16'");await run("window.registerwerkNavigate('connection');document.querySelector('#connect').click()");await wait('window.registerwerkUI.snapshot().connected');
   await run("window.registerwerkNavigate('points');document.querySelector('#readOnce').click()");await wait("!window.registerwerkUI.snapshot().running && document.querySelector('#statLast').textContent!=='—'");
   const values=await run("[...document.querySelectorAll('.value-cell')].map(x=>x.textContent)");assert.deepEqual(values,expected);
   console.log('PASS '+mode+': FC01/02/03, BOOL, HEX, Faktor, INT/UINT16/32 und FLOAT32 in allen Bytefolgen');
   const count=requests;await run("document.querySelector('#start').click()");await wait('window.registerwerkUI.snapshot().running');
   for(const page of ['settings','monitor','help','diagnostics','points']){await run(`window.registerwerkNavigate('${page}')`);assert.equal(await run('window.registerwerkUI.snapshot().connected && window.registerwerkUI.snapshot().running'),true);}
   await new Promise(r=>setTimeout(r,100));assert(requests>count);await run("document.querySelector('#globalStop').click()");await wait('!window.registerwerkUI.snapshot().running');assert.equal(await run('window.registerwerkUI.snapshot().connected'),true);
   console.log('PASS '+mode+': Seitenwechsel während laufender Messung, globaler Stopp erhält Verbindung');
   await run("window.registerwerkNavigate('registers');document.querySelector('#blockFunction').value='04';document.querySelector('#blockAddress').value='100';document.querySelector('#blockCount').value='3';document.querySelector('#readBlock').click()");await wait("document.querySelectorAll('#blockRows tr').length===3");assert.match(await run("document.querySelector('#blockRows').textContent"),/1234/);
   assert.equal(await run("document.querySelector('#openWrite').disabled"),true);
   await run("window.registerwerkNavigate('settings');document.querySelector('#prefReadOnly').click()");await wait('!window.registerwerkUI.snapshot().readOnly');
   for(const [fc,format,value,address] of [['05','UINT16','1',500],['06','UINT16','4567',501],['15','UINT16','1; 0; 1',502],['16','FLOAT32 CDAB','23,5; -12',510]]){
    await run(`window.registerwerkNavigate('registers');document.querySelector('#openWrite').click();document.querySelector('#writeDevice').value='1';document.querySelector('#writeFunction').value='${fc}';document.querySelector('#writeFunction').dispatchEvent(new Event('change'));document.querySelector('#writeFormat').value='${format}';document.querySelector('#writeAddress').value='${address}';document.querySelector('#writeValues').value=${JSON.stringify(value)};document.querySelector('#previewWrite').click();`);
    assert.equal(await run("document.querySelector('#confirmWrite').classList.contains('show')"),true);const before=writes.length;
    await run("document.querySelector('#doWrite').click()");await wait('!window.registerwerkUI.snapshot().writing');assert.equal(writes.length,before+1);assert.match(await run("document.querySelector('#log').textContent"),/Rückleseprüfung erfolgreich/);
   }
   assert.equal(regs.get(501),4567);assert.equal(coils.get(502),1);assert.equal(coils.get(503),0);assert.equal(coils.get(504),1);
   console.log('PASS '+mode+': FC04-Bereich und FC05/06/15/16 bewusst bestätigt, jeweils genau einmal, Rückleseprüfung');
   await run("document.querySelector('#openWrite').click();document.querySelector('#writeDevice').value='1';document.querySelector('#writeFunction').value='06';document.querySelector('#writeFormat').value='UINT16';document.querySelector('#writeAddress').value='62000';document.querySelector('#writeValues').value='10';document.querySelector('#previewWrite').click();document.querySelector('#doWrite').click()");await wait('!window.registerwerkUI.snapshot().writing');assert.equal(await run('window.registerwerkUI.snapshot().connected'),true);assert.equal(writes.filter(w=>w.addr===62000).length,1);
   console.log('PASS '+mode+': Schreibtimeout ohne automatische Wiederholung');
   // Direct IPC tests: main-process read-only enforcement, oversized response, wrong transaction, disconnect.
   await run("window.registerwerkNavigate('settings');document.querySelector('#prefReadOnly').click()");await wait('window.registerwerkUI.snapshot().readOnly');
   for(const address of [65000,...(mode==='tcp'?[65001]:[]),65002]){
    const id=await run(`window.registerwerkDesktop.tcpConnect('127.0.0.1',${server.address().port})`);
    const req=[...frame([1,3,address>>8,address&255,0,1])];
    const rejected=await run(`window.registerwerkDesktop.tcpExchange(${JSON.stringify(id)},${JSON.stringify(req)},'${mode}',200).then(()=>false,()=>true)`);assert.equal(rejected,true);
   }
   const id=await run(`window.registerwerkDesktop.tcpConnect('127.0.0.1',${server.address().port})`),before=writes.length;
   const write=[...frame([1,6,0,10,0,1])];assert.equal(await run(`window.registerwerkDesktop.tcpExchange(${JSON.stringify(id)},${JSON.stringify(write)},'${mode}',200).then(()=>false,()=>true)`),true);assert.equal(writes.length,before);await run(`window.registerwerkDesktop.tcpDisconnect(${JSON.stringify(id)})`);
   console.log('PASS '+mode+': übergroße Antworten, Verbindungsabbruch, TCP-Transaktions-ID und Nur-Lesen im Hauptprozess');
  }finally{for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));}
 }
};
