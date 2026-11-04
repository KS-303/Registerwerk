'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../source/Registerwerk.html'),'utf8');
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a,'Core function boundaries changed');return source.slice(a,b);}
function harness(fc=3){
 const app={rxBuffer:[],lastBusActivity:0,pending:null},logs=[],accepted=[];
 const context=vm.createContext({app,log:s=>logs.push(s),clearTimeout,Uint8Array,Date});
 const code=extract('  const crc16 =','  function fail(')+extract('  function matchesPending(','  async function waitBusReady(')+extract('  function expectedLen(','  function rejectPending(')+extract('  function exceptionLabel(','  function charTimeMs(')+extract('  function stripEcho(','  async function readerLoop(');
 vm.runInContext(code+';globalThis.frame=frame;globalThis.receiveByte=receiveByte;',context);
 app.pending={device:1,func:fc,request:context.frame([1,fc,0,0,0,1]),resolve:r=>accepted.push([...r]),timer:null,stray:0,badCrc:0};
 return {app,logs,accepted,frame:a=>[...context.frame(a)],feed:bytes=>bytes.forEach(context.receiveByte)};
}
test('RTU: CRC-Beispiel, fragmentierte Antwort und Gerätezuteilung',()=>{const h=harness();assert.deepEqual(h.frame([1,3,0,0,0,1]),[1,3,0,0,0,1,132,10]);const r=h.frame([1,3,2,0,42]);h.feed(r.slice(0,3));assert.equal(h.accepted.length,0);h.feed(r.slice(3));assert.deepEqual(h.accepted,[r]);});
test('RTU: Echo, Störbytes, Fremdgerät und CRC-Fehler werden vor gültiger Antwort verworfen',()=>{const h=harness(),r=h.frame([1,3,2,0,42]),bad=[...r];bad[bad.length-1]^=1;h.feed(h.app.pending.request);h.feed([255,0,255]);h.feed(h.frame([2,3,2,0,10]));h.feed(bad);h.feed(r);assert.deepEqual(h.accepted,[r]);assert(h.logs.some(s=>s.includes('Echo')));assert(h.logs.some(s=>s.includes('ignoriert')));});
test('RTU: falsche Funktion/Länge zählen nicht als Antwort; Ausnahme gehört zum Auftrag',()=>{const h=harness();h.feed(h.frame([1,4,2,0,1]));h.feed(h.frame([1,3,4,0,1,0,2]));assert.equal(h.accepted.length,0);const r=h.frame([1,0x83,2]);h.feed(r);assert.deepEqual(h.accepted,[r]);});
test('RTU: Empfangspuffer bleibt bei Störverkehr begrenzt und erholt sich',()=>{const h=harness();h.feed(Array(20000).fill(255));assert(h.app.rxBuffer.length<=512);const r=h.frame([1,3,2,0,42]);h.feed(r);assert.deepEqual(h.accepted,[r]);});
test('RTU: FC06 identisches Schreibecho ist nur Kandidat und muss nachgelagert rückgelesen werden',()=>{const h=harness(6),r=[...h.app.pending.request];h.feed(r);assert.deepEqual(h.accepted,[r]);assert(!h.logs.some(s=>s.includes('Echo des eigenen')));});
