'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({window})=>{
 const run=c=>window.webContents.executeJavaScript(c,true);
 const wait=async c=>{const end=Date.now()+6000;while(Date.now()<end){if(await run(c))return;await new Promise(r=>setTimeout(r,25));}throw Error('Darstellung: '+c);};
 const color=async(selector,property)=>run(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).${property}`);
 const rgb=c=>{const m=c.match(/\d+/g);assert(m&&m.length>=3,`Ungültige Farbe: ${c}`);return m.slice(0,3).map(Number);};
 const lum=c=>{let [r,g,b]=rgb(c).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
 const contrast=(a,b)=>{const values=[lum(a),lum(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);};
 await run("window.registerwerkNavigate('settings');{let e=document.querySelector('#prefTheme');e.value='dark';e.dispatchEvent(new Event('change'));}");
 await wait("document.documentElement.dataset.theme==='dark'");
 await run("document.querySelector('#txOpenExport').click()");
 await wait("document.querySelector('#txEditor').classList.contains('show')");
 if(process.env.REGISTERWERK_CAPTURE_DIR){
  await fs.mkdir(process.env.REGISTERWERK_CAPTURE_DIR,{recursive:true});window.setSize(1500,1000);window.show();await run("document.querySelector('#txEditor .tx-dialog').scrollTop=0");await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,200));await fs.writeFile(path.join(process.env.REGISTERWERK_CAPTURE_DIR,'tx-dark-top.png'),(await window.webContents.capturePage()).toPNG());
 }
 await run("document.querySelector('#txRows .tx-edit').click()");
 await wait("!document.querySelector('#txDetails').classList.contains('hidden')");
 const surface=await color('.tx-dialog','backgroundColor');
 for(const selector of ['.tx-top','.tx-details','.tx-bulk','.tx-options']){
  const background=await color(selector,'backgroundColor');assert(lum(background)<.1,`${selector} ist nicht dunkel: ${background}`);
 }
 for(const [fg,bg] of [['.tx-bulk-options label','.tx-bulk'],['.tx-field-group h4','.tx-details'],['.tx-top label','.tx-top'],['.tx-info','.tx-top']]){
  const foreground=await color(fg,'color'),background=await color(bg,'backgroundColor');assert(contrast(foreground,background)>=4.5,`${fg}: zu geringer Kontrast ${contrast(foreground,background)}`);
 }
 await run("document.querySelector('#txRows tr').classList.add('tx-invalid-row');document.querySelector('#txAddress').setAttribute('aria-invalid','true')");
 const invalid=await color('#txRows tr','backgroundColor');assert(lum(invalid)<.12,`Fehlerzeile ist zu hell: ${invalid}`);assert(contrast(await color('#txAddress','color'),await color('#txAddress','backgroundColor'))>=4.5);
 if(process.env.REGISTERWERK_CAPTURE_DIR){
  await fs.mkdir(process.env.REGISTERWERK_CAPTURE_DIR,{recursive:true});window.setSize(1500,1000);window.show();await run("document.querySelector('#txDetails').scrollIntoView({block:'nearest'})");await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,200));await fs.writeFile(path.join(process.env.REGISTERWERK_CAPTURE_DIR,'tx-dark.png'),(await window.webContents.capturePage()).toPNG());
 }
 await run("document.querySelector('#txAddress').removeAttribute('aria-invalid');document.querySelector('#txRows tr').classList.remove('tx-invalid-row');document.querySelector('#txClose').click();window.registerwerkNavigate('settings');{let e=document.querySelector('#prefTheme');e.value='light';e.dispatchEvent(new Event('change'));}");
 await wait("document.documentElement.dataset.theme==='light'");await run("document.querySelector('#txOpenExport').click();document.querySelector('#txRows .tx-edit').click()");
 assert(lum(await color('.tx-top','backgroundColor'))>.7,'Helle TX-Oberfläche geändert');
 assert(contrast(await color('.tx-field-group h4','color'),await color('.tx-details','backgroundColor'))>=4.5);
 await run("document.querySelector('#txClose').click();window.registerwerkNavigate('points')");
 console.log('PASS Darkmode: TX-Flächen, Beschriftungen, Hinweise und Fehlerkontrast; Hellmodus bleibt lesbar');
};
