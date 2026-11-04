'use strict';
const {build,Platform,Arch}=require('electron-builder');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const signed=process.argv.includes('--signed');
const publisher=process.env.REGISTERWERK_PUBLISHER_NAME||'';
if(signed&&(!publisher.startsWith('CN=')||!process.env.CSC_LINK))throw Error('Signierter Release erfordert REGISTERWERK_PUBLISHER_NAME (vollständiger Zertifikat-Subject) und CSC_LINK.');
const trustFile=path.join(root,'desktop','update-trust.json');
const previous=fs.readFileSync(trustFile);
(async()=>{
 try{
  fs.writeFileSync(trustFile,JSON.stringify({publisher:signed?publisher:null,signedBuild:signed}));
  await build({projectDir:root,targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),publish:'never',config:{forceCodeSigning:signed,win:{target:[{target:'nsis',arch:['x64']}],...(signed?{signtoolOptions:{publisherName:publisher}}:{signAndEditExecutable:true}),},...(signed?{}:{cscLink:null})}});
 }finally{fs.writeFileSync(trustFile,previous);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
