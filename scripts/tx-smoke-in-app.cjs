'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async ({window, ses, app, appUrl}) => {
  const run = (code) => window.webContents.executeJavaScript(code, true);
  const wait = async (code) => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      if (await run(code)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('TX-Editor: Wartebedingung nicht erfüllt: ' + code);
  };
  const readFixture = async (envName, fallback) => process.env[envName]
    ? fs.readFile(process.env[envName], 'utf8') : fallback;
  const wrap = (points) => `<?xml version="1.0"?><TxOpen xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="0103"><DocumentHeader Version="0201"><DocumentSummary><DocumentCompany>Test</DocumentCompany><DocumentCreated User="private"/></DocumentSummary><DocumentDelivery><DocumentSourceIdentifier>private-path</DocumentSourceIdentifier></DocumentDelivery></DocumentHeader><DocumentBody><ModuleCfg><SupportedItfs><Itf CLTag="STF" ItfVersion="01.10"/></SupportedItfs></ModuleCfg><ThirdBus BusType="RS485" ProtAppName="Modbus_HQ_V6.00" ProtAppRevision="000"><ThirdDevice FunctionName="Test" DevDesc="Test" DevCommSettings="9600,N,8,1,RS485T,0,0,RTU">${points}</ThirdDevice></ThirdBus></DocumentBody></TxOpen>`;
  const point = (name, resource, sys, tag, signal, set) => `<ThirdIo IoName="${name}" IoDesc="Test" IoResourceType="${resource}" IoSignalType="${sys}" IoUnit="" ObjectTag="${tag}" ThirdSignalType="${signal}" ThirdDefaultValue="0" ThirdRangeLow="0" ThirdRangeHigh="1" ThirdConversionSet="${set}"><ThirdIoParams><ThirdIoPar P1Name="NameRef" P2Val="10.0"/></ThirdIoParams></ThirdIo>`;
  const a = await readFixture('REGISTERWERK_TX_SAMPLE_A', wrap(point('A','4','90','8','UINT16','5;1;0;0')+point('B','2','93','3','UINT16','3;65;0;0')+point('C','4','90','8','UINT16','1;3;0;0')+point('D','4','90','8','UINT16','1;8;0;0')+point('E','3','90','6','BOOL','2;32;0;0')));
  const b = await readFixture('REGISTERWERK_TX_SAMPLE_B', wrap(point('Sp','2','93','3','UINT16/R15','16;0;0;0')+point('DovrMod','2','93','3','UINT16/R15','16;1;0;0')+point('PrVfl','1','93','1','UINT16/R15','3;7;0;0')+point('Err','1','93','1','UINT16','4;104;0;0')+point('VMin','2','93','3','UINT16/R15','16;105;0;0')+point('VMax','2','93','3','UINT16/R15','16;106;0;0')));
  const upload = async (xml) => {
    await run(`{const t=new DataTransfer();t.items.add(new File([${JSON.stringify(xml)}],'test.ioopt',{type:'application/xml'}));const f=document.querySelector('#txFile');f.files=t.files;f.dispatchEvent(new Event('change'));}`);
    await wait("document.querySelector('#txEditor').classList.contains('show')");
  };
  const save = async (filename) => {
    const out = path.join(app.getPath('userData'), filename);
    let listener;
    const downloaded = new Promise((resolve,reject) => {
      const timer=setTimeout(()=>{ses.removeListener('will-download',listener);reject(new Error('TX-Download nicht gestartet'));},8000);
      listener=(_e,item)=>{
        try {
          const options=item.getSaveDialogOptions();
          assert(options.filters.some(f=>f.extensions.includes('ioopt')));
          assert(options.defaultPath.endsWith('.ioopt'));
          item.setSavePath(out);
          item.once('done',(_event,status)=>{clearTimeout(timer);status==='completed'?resolve():reject(new Error(status));});
        } catch (error) {clearTimeout(timer);reject(error);}
      };
      ses.once('will-download',listener);
    });
    await run("document.querySelector('#txExport').click()");
    await downloaded;
    return fs.readFile(out, 'utf8');
  };
  const parse = (xml) => run(`(()=>{const d=new DOMParser().parseFromString(${JSON.stringify(xml)},'application/xml');const b=d.getElementsByTagName('ThirdBus')[0],dev=d.getElementsByTagName('ThirdDevice')[0];return {error:!!d.querySelector('parsererror'),busType:b?.getAttribute('BusType'),busComm:b?.getAttribute('BusCommSettings'),deviceComm:dev?.getAttribute('DevCommSettings'),protocol:b?.getAttribute('ProtAppName'),points:[...d.getElementsByTagName('ThirdIo')].map(x=>({name:x.getAttribute('IoName'),set:x.getAttribute('ThirdConversionSet'),signal:x.getAttribute('ThirdSignalType'),resource:x.getAttribute('IoResourceType'),attrs:Object.fromEntries([...x.attributes].map(a=>[a.name,a.value])),params:[...x.getElementsByTagName('ThirdIoPar')].map(p=>Object.fromEntries([...p.attributes].map(a=>[a.name,a.value])))})),source:[...d.getElementsByTagName('DocumentSourceIdentifier')].map(x=>x.textContent),user:[...d.querySelectorAll('DocumentCreated,DocumentLastModified')].map(x=>x.getAttribute('User')),header:[...d.querySelector('DocumentSummary').children].map(x=>x.localName)};})()`);
  await window.loadURL(appUrl);
  await wait("!!document.querySelector('#txFile')");
  await upload(a);
  assert.equal(await run("document.querySelectorAll('#txRows tr').length"),5);
  await run("document.querySelector('#txSelectNone').click();document.querySelectorAll('.tx-check')[0].click();document.querySelectorAll('.tx-check')[1].click();document.querySelector('#txBulkOptions input[value=\"/R15\"]').checked=true;document.querySelector('#txBulkOptions input[value=\"/S\"]').checked=true;document.querySelector('#txApplyOption').click();document.querySelector('#txAllowMismatch').checked=true");
  assert.equal(await run("document.querySelector('#txCount').textContent.startsWith('2 von 5')"),true);
  const savedA=await save('tx-a.ioopt'), parsedA=await parse(savedA);
  assert.equal(parsedA.error,false);assert.equal(parsedA.points.length,2);
  assert(parsedA.points.every(x=>/\/R15/.test(x.signal)&&/\/S/.test(x.signal)));
  assert.deepEqual(parsedA.source,['Registerwerk']);assert(parsedA.user.every(x=>x==='Registerwerk'));assert(parsedA.header.includes('DocumentCreated'));assert(parsedA.header.includes('DocumentLastModified'));
  assert(!savedA.includes('private-path'));assert(!savedA.includes('User=\"private\"'));
  await window.loadURL(appUrl);await wait("!!document.querySelector('#txFile')");await upload(savedA);
  assert.equal(await run("document.querySelectorAll('#txRows tr').length"),2);
  console.log('PASS IOOPT laden, Mehrfachauswahl, kombinierte Zusätze, Export und Wiederladen');
  await window.loadURL(appUrl);await wait("!!document.querySelector('#txFile')");await upload(b);
  assert.equal(await run("document.querySelectorAll('#txRows tr').length"),6);
  assert.equal(await run("getComputedStyle(document.querySelector('#txEditor')).display"), 'flex');
  if (process.env.REGISTERWERK_TX_SCREENSHOT) {
    await run("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await fs.writeFile(process.env.REGISTERWERK_TX_SCREENSHOT, (await window.capturePage()).toPNG());
  }
  const savedB=await save('tx-b.ioopt'), parsedB=await parse(savedB), originalB=await parse(b);
  assert.deepEqual(parsedB.points,originalB.points);
  assert.deepEqual([parsedB.busType,parsedB.busComm,parsedB.deviceComm,parsedB.protocol], [originalB.busType,originalB.busComm,originalB.deviceComm,originalB.protocol]);
  console.log('PASS Zweite IOOPT-Vorlage: alle sechs Konversionsdaten bleiben erhalten');
  await run("window.confirm=()=>true;document.querySelector('#txNames').value='blank';document.querySelector('#txDescriptions').checked=false;document.querySelector('#txUnits').checked=false;document.querySelector('#txRanges').checked=false");
  const blank = await parse(await save('tx-blank.ioopt'));
  assert(blank.points.every(p=>p.name==='' && p.attrs.IoDesc==='' && p.attrs.IoUnit==='' && !('ThirdRangeLow' in p.attrs)));
  console.log('PASS Optionale Namen, Beschreibungen, Einheiten und Wertebereiche');
  await window.loadURL(appUrl);await wait("!!document.querySelector('#txFile')");
  const convTypes=['UINT16','UINT32','UINT16','UINT16','UINT32','UINT32','UINT32','UINT32','SINT32','UINT16'];
  const conversionFixture=wrap(convTypes.map((type,i)=>point(`C${i}`,'1','93','1',type,`3;${100+i};0;${i}`)).join(''));
  await upload(conversionFixture);
  const conversionRoundTrip=await parse(await save('tx-conversions.ioopt'));
  assert.deepEqual(conversionRoundTrip.points.map(p=>p.set.split(';')[3]), ['0','1','2','3','4','5','6','7','8','9']);
  console.log('PASS Alle dokumentierten MappingInfo-4-Formatcodes 0 bis 9');
  await window.loadURL(appUrl);await wait("!!document.querySelector('#txFile')");
  await upload(wrap(point('FLOAT_A','1','93','1','FLOAT','3;1;0;0')+point('FLOAT_B','1','93','1','FLOAT','3;3;0;0')));
  await run("[...document.querySelectorAll('#txBulkOptions input[type=checkbox]')].filter(x=>['/R15','/D='].includes(x.value)).forEach(x=>x.checked=true);document.querySelector('#txBulkD').value='10';document.querySelector('#txApplyOption').click()");
  const divisor = await parse(await save('tx-divisor.ioopt'));
  assert(divisor.points.every(p=>/\/R15/.test(p.signal) && /\/D=10/.test(p.signal)));
  console.log('PASS Divisor und weiterer Zusatz gleichzeitig auf mehrere Punkte');
  await window.loadURL(appUrl);await wait("!!document.querySelector('#txFile')");
  await upload(wrap(point('PADDED','1','93','1','UINT32','03;7;00;01')));
  await run("document.querySelector('.tx-edit').click();document.querySelector('#txDetailClose').click()");
  assert.equal((await parse(await save('tx-padded.ioopt'))).points[0].set,'03;7;00;01');
  console.log('PASS Vorhandene numerische Formatierung bleibt beim Bearbeiten erhalten');
  await window.loadURL(appUrl);await wait("!!document.querySelector('#txFile')");
  await upload(wrap(point('OUT','2','93','3','UINT16 /F','6;22;0;0')+point('FEEDBACK','1','93','1','UINT16 /F','6;22;0;0')));
  assert.equal((await parse(await save('tx-feedback.ioopt'))).points.length,2);
  console.log('PASS Dokumentiertes /F-Ausgangs-/Rückmeldepaar');
  await window.loadURL(appUrl);await wait("!!document.querySelector('#projectFile')");
  await run(`{const p={format:'registerwerk-modbus-rtu',version:3,points:[{name:'Bit',device:1,func:'04',address:100,format:'BOOL',bit:0},{name:'Temperatur',device:1,func:'03',address:200,format:'UINT16',scale:0.1}]};const t=new DataTransfer();t.items.add(new File([JSON.stringify(p)],'test.json',{type:'application/json'}));const f=document.querySelector('#projectFile');f.files=t.files;f.dispatchEvent(new Event('change'));}`);
  await wait("document.querySelector('.name-input')?.value === 'Bit'");
  await run("document.querySelector('#txOpenExport').click()");
  assert.match(await run("document.querySelector('#txRows').innerText"), /4;100;1;1/);
  assert.deepEqual(await run("[...document.querySelectorAll('#txRows tr')].map(r => r.children[6].textContent)"), ['UINT16','UINT16']);
  assert.equal(await run("window.registerwerkUpdateIdle()"), false);
  assert.match(await run("document.querySelectorAll('#txRows tr')[1].textContent"), /Hinweis zur Übernahme/);
  await run("document.querySelectorAll('.tx-edit')[1].click()");
  assert.match(await run("document.querySelector('#txRowWarning').textContent"), /Faktor 0.1/);
  assert.equal(await run("!!document.querySelector('#txReviewed')"), false);
  assert.equal((await parse(await save('tx-scale-no-confirm.ioopt'))).points.length, 2);
  console.log('PASS Skalierungshinweis sichtbar und Export ohne Bestätigung');
  await window.loadURL(appUrl);await wait("!!document.querySelector('#txFile')");
  await upload(wrap(point('FIRST','1','93','1','UINT16','3;1;0;0')+point('SECOND','1','93','1','UINT16','3;2;0;0')));
  await run("{document.querySelectorAll('.tx-check')[0].click();document.querySelectorAll('.tx-edit')[1].click();const x=document.querySelector('#txAddress');x.value='';x.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#txExport').click()}");
  assert.match(await run("document.querySelector('#txError').textContent"), /Punkt 2/);
  assert.equal(await run("document.querySelector('#txAddress').getAttribute('aria-invalid')"),'true');
  assert.match(await run("document.querySelector('#txAddress').closest('label').querySelector('.tx-field-error').textContent"),/Protokolladresse/);
  await run("{const x=document.querySelector('#txAddress');x.value='2';x.dispatchEvent(new Event('input',{bubbles:true}));}");
  assert.equal(await run("document.querySelector('#txAddress').hasAttribute('aria-invalid')"),false);
  assert.equal((await parse(await save('tx-error-corrected.ioopt'))).points.length,1);
  console.log('PASS Fehler am richtigen ausgewählten Datenpunkt markieren und nach Korrektur exportieren');
  await window.loadURL(appUrl);await wait("!!document.querySelector('#txFile')");
  await upload(wrap(point('ERR1','1','93','1','','3;1;0;0')+point('ERR2','1','93','1','UINT16','3;2;0;0')));
  await run("{document.querySelectorAll('.tx-edit')[1].click();const x=document.querySelector('#txAddress');x.value='';x.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#txExport').click()}");
  assert.equal(await run("document.querySelectorAll('#txRows tr.tx-invalid-row').length"),2);
  assert.match(await run("document.querySelectorAll('#txRows tr')[0].textContent"),/Fremd-Signaltyp fehlt/);
  assert.match(await run("document.querySelectorAll('#txRows tr')[1].textContent"),/Protokolladresse/);
  await run("document.querySelectorAll('.tx-edit')[1].click()");
  assert.equal(await run("document.querySelector('#txAddress').getAttribute('aria-invalid')"),'true');
  await run("{const x=document.querySelector('#txAddress');x.value='2';x.dispatchEvent(new Event('input',{bubbles:true}));}");
  assert.match(await run("document.querySelectorAll('#txRows tr')[1].textContent"),/erneut prüfen/);
  await run("document.querySelector('#txExport').click()");
  assert.equal(await run("document.querySelectorAll('#txRows tr.tx-invalid-row').length"),1);
  await run("{const x=document.querySelector('#txSignal');x.value='UINT16';x.dispatchEvent(new Event('input',{bubbles:true}));}");
  assert.equal((await parse(await save('tx-two-errors-corrected.ioopt'))).points.length,2);
  console.log('PASS Mehrere fehlerhafte Datenpunkte und Korrektur in der Übersicht');

  await window.loadURL(appUrl);await wait("!!document.querySelector('#projectFile')");
  await run(`{const p={format:'registerwerk-modbus-rtu',version:3,settings:{transport:'tcp',tcpHost:'192.0.2.10',tcpPort:502},points:[{name:'TCP',device:1,func:'04',address:1,format:'UINT16'}]};const t=new DataTransfer();t.items.add(new File([JSON.stringify(p)],'test.json',{type:'application/json'}));const f=document.querySelector('#projectFile');f.files=t.files;f.dispatchEvent(new Event('change'));}`);
  await wait("document.querySelector('.name-input')?.value === 'TCP'");
  await run("document.querySelector('#txOpenExport').click()");
  assert.equal(await run("document.querySelector('#txBus').value"),'IPv4');
  assert.equal(await run("document.querySelector('#txComm').value"),'');
  const tcpXml = await save('tx-tcp.ioopt'), tcpParsed = await parse(tcpXml);
  assert.equal(tcpParsed.error,false,tcpXml.slice(0,600));
  assert.equal(tcpParsed.busType,'IPv4');
  assert.deepEqual(tcpParsed.header,['DocumentCompany','DocumentApplication','DocumentCreated','DocumentLastModified','DocumentVersion','DocumentRevision']);
  assert.deepEqual(tcpParsed.source,['Registerwerk']);assert.deepEqual(tcpParsed.user,['Registerwerk','Registerwerk']);
  console.log('PASS TCP-Projekt erhält keine erfundene serielle TX-Kommunikation');
};
