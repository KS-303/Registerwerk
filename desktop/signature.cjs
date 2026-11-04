'use strict';
const path=require('node:path');
const {execFile}=require('node:child_process');
function validateSignature(data,filename,publisher){
  if(!publisher || typeof publisher!=='string' || !publisher.startsWith('CN=')) throw Error('Kein vertrauenswürdiger Herausgeber konfiguriert.');
  if(!data || data.Status!=='Valid')throw Error('Update-Signatur ungültig oder nicht überprüfbar.');
  if(data.Subject!==publisher)throw Error('Update stammt nicht vom konfigurierten Herausgeber.');
  if(typeof data.Path!=='string'||path.win32.normalize(data.Path).toLowerCase()!==path.win32.normalize(filename).toLowerCase())throw Error('Signaturprüfung meldet einen anderen Dateipfad.');
  return null;
}
function verifyWindowsSignature(filename,publisher){
  if(process.platform!=='win32')return Promise.reject(Error('Authenticode-Prüfung erfordert Windows.'));
  if(typeof filename!=='string'||!path.win32.isAbsolute(filename))return Promise.reject(Error('Ungültiger Update-Pfad.'));
  // Constant script; untrusted filenames are passed as an environment value, never executable code.
  const script="$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:REGISTERWERK_VERIFY_FILE; @{Status=$s.Status.ToString();Subject=$s.SignerCertificate.Subject;Path=$s.Path} | ConvertTo-Json -Compress";
  const exe=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  return new Promise((resolve,reject)=>execFile(exe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:20000,maxBuffer:65536,windowsHide:true,shell:false,env:{...process.env,REGISTERWERK_VERIFY_FILE:filename}},(error,stdout,stderr)=>{
    if(error||stderr.trim())return reject(Error('Update-Signatur konnte nicht sicher überprüft werden.'));
    try{resolve(validateSignature(JSON.parse(stdout.replace(/^\uFEFF/,'')),filename,publisher));}catch(e){reject(e);}
  }));
}
module.exports={validateSignature,verifyWindowsSignature};
