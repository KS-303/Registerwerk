'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({window,appUrl,app})=>{
 const run=c=>window.webContents.executeJavaScript(c,true);
 const wait=async c=>{const end=Date.now()+8000;while(Date.now()<end){if(await run(c))return;await new Promise(r=>setTimeout(r,20));}throw Error('Shell: '+c);};
 await wait('!!window.registerwerkNavigate');
 const before=await run("window.registerwerkUI.snapshot()");
 await run("window.__pointNode=document.querySelector('#pointRows tr');window.__inputNode=document.querySelector('.name-input');");
 for(const p of ['connection','scan','registers','diagnostics','monitor','projects','settings','help','points']){
   await run(`window.registerwerkNavigate('${p}')`);
   assert.equal(await run(`document.querySelector('#page-${p}').hidden`),false);
   assert.equal(await run("document.querySelectorAll('.shell-page:not([hidden])').length"),1);
   assert.equal(await run("document.querySelector('#pointRows tr')===window.__pointNode && document.querySelector('.name-input')===window.__inputNode"),true);
 }
 assert.equal((await run('window.registerwerkUI.snapshot()')).points,before.points);
 console.log('PASS Navigation: genau eine Seite, dieselben Datenpunktknoten, keine neue Kommunikationsinstanz');
 await run("window.registerwerkNavigate('settings');const el=document.querySelector('#prefTheme');el.value='dark';el.dispatchEvent(new Event('change'));");
 await wait("document.documentElement.dataset.theme==='dark'");
 await run("document.querySelector('#prefRestore').click()");await wait("document.querySelector('#settingsSaveStatus').textContent==='Einstellungen gespeichert.'");
 // Main-process settings persistence and project isolation.
 await wait("window.registerwerkDesktop.preferences!==null");
 const saved=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'settings.json'),'utf8'));
 assert.equal(saved.theme,'dark');assert.equal(saved.restoreSession,false);assert(!('points'in saved));
 await window.loadURL(appUrl);await wait('!!window.registerwerkNavigate');
 assert.equal(await run('window.registerwerkUI.snapshot().points'),1);
 assert.equal(await run('window.registerwerkUI.snapshot().connected'),false);
 assert.equal(await run('document.documentElement.dataset.theme'),'dark');
 assert.equal(await run('window.registerwerkUI.snapshot().readOnly'),true);
 console.log('PASS Einstellungen: Neustart, Dunkelmodus, Sitzung optional, keine automatische Verbindung, Nur-Lesen');
 // malformed import must preserve current state and not render HTML
 for(const data of [[],{format:'registerwerk-modbus-rtu',version:3,settings:[],points:[]},{format:'registerwerk-modbus-rtu',version:3,points:[{name:'x',device:true,func:'03',address:0,format:'UINT16'}]}]){
   await run(`{const d=new DataTransfer();d.items.add(new File([${JSON.stringify(JSON.stringify(data))}],'bad.json'));const f=document.querySelector('#projectFile');f.files=d.files;f.dispatchEvent(new Event('change'));}`);
   await wait("!document.querySelector('#topError').hidden");assert.equal(await run('window.registerwerkUI.snapshot().points'),1);
   await run("document.querySelector('#topError').hidden=true");
 }
 assert.equal(await run("window.registerwerkDesktop.savePreferences({filePath:'outside.json'}).then(()=>false,()=>true)"),true);
 assert.equal(await run("typeof require"),'undefined');
 console.log('PASS Manipulierte Projekte bleiben ohne Zustandsänderung; IPC erlaubt keine Dateipfade');
 await run("window.registerwerkNavigate('settings');document.querySelector('#prefRestore').click()");
 await wait("document.querySelector('#prefRestore').checked");
 if(process.env.REGISTERWERK_CAPTURE_DIR){
   await fs.mkdir(process.env.REGISTERWERK_CAPTURE_DIR,{recursive:true});window.show();
   for(const [p,theme,width,height]of [['points','light',1500,1000],['connection','light',1500,1000],['settings','dark',1500,1000],['points','dark',1024,768],['help','dark',1024,768]]){
     window.setSize(width,height);await run(`window.registerwerkNavigate('settings');{const e=document.querySelector('#prefTheme');e.value='${theme}';e.dispatchEvent(new Event('change'));}`);await wait(`document.documentElement.dataset.theme==='${theme}'`);await run(`window.registerwerkNavigate('${p}')`);
     await wait(`document.querySelector('#page-${p}').hidden===false`);await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,250));
     await fs.writeFile(path.join(process.env.REGISTERWERK_CAPTURE_DIR,`${p}-${theme}-${width}.png`),(await window.webContents.capturePage()).toPNG());
   }
 }
 await run("window.registerwerkNavigate('points')");
};
