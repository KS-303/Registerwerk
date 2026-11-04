'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateSignature}=require('../desktop/signature.cjs');
const file='C:\\Users\\Test\\AppData\\Local\\Registerwerk\\update.exe',publisher='CN=Example GmbH, O=Example GmbH, C=DE';
test('Signaturprüfung verlangt gültige Authenticode-Signatur, exakten Herausgeber und dieselbe Datei',()=>{
 assert.equal(validateSignature({Status:'Valid',Subject:publisher,Path:file},file,publisher),null);
 for(const data of [null,{}, {Status:'NotSigned',Subject:publisher,Path:file},{Status:'Valid',Subject:'CN=Other',Path:file},{Status:'Valid',Subject:publisher,Path:'C:\\other.exe'}])assert.throws(()=>validateSignature(data,file,publisher));
 assert.throws(()=>validateSignature({Status:'Valid',Subject:publisher,Path:file},file,''));
});
