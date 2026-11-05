'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PAGES = ['connection','points','scan','registers','diagnostics','monitor','projects','settings','help'];
const defaults = () => ({version:1, theme:'system', accent:'teal', density:'comfortable', lastPage:'points',
  introSeen:false, sidebarCompact:false, collapsedGroups:[], nameWidth:180, showRaw:true, tableDetails:false, restoreSession:true, startupMode:'ask', autoCheck:true, readOnly:true,
  lastPortName:'', connection:{}, window:null});
function validate(input) {
  if (!input || typeof input!=='object' || Array.isArray(input) || input.version!==1) throw Error('Nicht unterstützte Einstellungsdatei.');
  const out=defaults();
  if(input.startupMode===undefined && input.restoreSession===false)out.startupMode='new';
  for(const [key, choices] of Object.entries({theme:['system','light','dark'],accent:['teal','blue','purple','green','orange','rose'],density:['comfortable','compact'],startupMode:['ask','last','new'],lastPage:PAGES}))
    if(choices.includes(input[key]))out[key]=input[key];
  for(const key of ['introSeen','sidebarCompact','tableDetails','showRaw','restoreSession','autoCheck','readOnly'])if(typeof input[key]==='boolean')out[key]=input[key];
  if(Number.isInteger(input.nameWidth)&&input.nameWidth>=140&&input.nameWidth<=420)out.nameWidth=input.nameWidth;
  if(Array.isArray(input.collapsedGroups))out.collapsedGroups=[...new Set(input.collapsedGroups.filter(k=>['communication','data','application'].includes(k)))];
  if(typeof input.lastPortName==='string')out.lastPortName=input.lastPortName.slice(0,200);
  const c=input.connection;
  if(c&&typeof c==='object'&&!Array.isArray(c)){
    const rules={tcpPort:[1,65535],timeout:[100,30000],guard:[50,5000],pollDelay:[0,60000],roundDelay:[100,600000]};
    for(const [k,[lo,hi]]of Object.entries(rules))if(Number.isInteger(c[k])&&c[k]>=lo&&c[k]<=hi)out.connection[k]=c[k];
    for(const [k,values]of Object.entries({transport:['rtu','tcp','ethRtu'],baud:[1200,2400,4800,9600,19200,38400,57600,115200],parity:['none','even','odd'],dataBits:[8],stopBits:[1,2]}))if(values.includes(c[k]))out.connection[k]=c[k];
    if(typeof c.tcpHost==='string'&&c.tcpHost.length<=253&&!/[\s/\\]/.test(c.tcpHost))out.connection.tcpHost=c.tcpHost;
  }
  const w=input.window;
  if(w&&[w.width,w.height,w.x,w.y].every(Number.isInteger)&&w.width>=900&&w.width<=10000&&w.height>=650&&w.height<=10000&&Math.abs(w.x)<100000&&Math.abs(w.y)<100000)
    out.window={width:w.width,height:w.height,x:w.x,y:w.y,maximized:w.maximized===true};
  return out;
}
class SettingsStore {
  constructor(directory){this.file=path.join(directory,'settings.json');this.value=defaults();this.warning='';this.load();}
  snapshot(){return JSON.parse(JSON.stringify(this.value));}
  read(file){if(fs.statSync(file).size>65536)throw Error('Einstellungsdatei zu groß.');return validate(JSON.parse(fs.readFileSync(file,'utf8')));}
  load(){
    try{this.value=this.read(this.file);}catch(e){
      if(e.code==='ENOENT')return;
      this.warning='Persönliche Einstellungen waren beschädigt. Standardwerte wurden geladen.';
      try{this.value=this.read(this.file+'.bak');this.warning='Persönliche Einstellungen aus der letzten gültigen Sicherung wiederhergestellt.';}catch{}
      try{fs.renameSync(this.file,this.file+'.corrupt');}catch{}
    }
  }
  update(patch){
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||Buffer.byteLength(JSON.stringify(patch))>65536)throw Error('Ungültige Einstellungen.');
    const next=validate({...this.value,...patch,version:1});
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.tmp';
    // Backup only validated content; keep a recovered backup if the main file was corrupt.
    try{this.read(this.file);fs.copyFileSync(this.file,this.file+'.bak');}catch(e){if(e.code!=='ENOENT')throw e;}
    try{fs.writeFileSync(temp,JSON.stringify(next,null,2),{mode:0o600,flush:true});fs.renameSync(temp,this.file);}
    catch(e){try{fs.unlinkSync(temp);}catch{}throw e;}
    this.value=next;return this.snapshot();
  }
  resetAppearance(){const d=defaults();return this.update(Object.fromEntries(['theme','accent','density','lastPage','sidebarCompact','collapsedGroups','nameWidth','showRaw','tableDetails'].map(k=>[k,d[k]])));}
}
function visibleBounds(saved, displays){
  if(!saved)return {};
  const area=displays.find(d=>saved.x<d.x+d.width&&saved.x+saved.width>d.x&&saved.y<d.y+d.height&&saved.y+saved.height>d.y)||displays[0];
  if(!area)return {};
  const width=Math.min(saved.width,area.width),height=Math.min(saved.height,area.height);
  return {width,height,x:Math.max(area.x,Math.min(saved.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(saved.y,area.y+area.height-height))};
}
module.exports={SettingsStore,validate,defaults,visibleBounds};
