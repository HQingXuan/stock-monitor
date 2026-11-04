import { t } from '../src/messages.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { loadEnv, requireSecrets, secretNames, root, deploymentConfig } from './env.mjs';

const env=loadEnv();
const cli=new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url);
const configPath=new URL('../wrangler.local.json',import.meta.url);

function run(args, {capture=false,input=null}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli.pathname,...args],{
      cwd:root,env:process.env,stdio:[input===null?'inherit':'pipe',capture?'pipe':'inherit','inherit']
    });
    let output='';if(capture)child.stdout.on('data',x=>output+=x);
    if(input!==null)child.stdin.end(input);
    child.on('error',()=>reject(new Error(t(env.MESSAGE_LANGUAGE, 'wranglerStart'))));
    child.on('close',code=>code===0?resolve(output):reject(new Error(t(env.MESSAGE_LANGUAGE, 'wranglerFailed', { command: args[0], code: code }))));
  });
}

try {
  requireSecrets(env);
  if(!existsSync(cli))throw new Error(t(env.MESSAGE_LANGUAGE, 'installTools'));
  console.log(t(env.MESSAGE_LANGUAGE, 'cloudLogin'));
  await run(['login']);
  let dbs=JSON.parse(await run(['d1','list','--json'],{capture:true}));
  let database=dbs.find(d=>d.name==='opening-stock-watch');
  if(!database) {
    await run(['d1','create','opening-stock-watch']);
    dbs=JSON.parse(await run(['d1','list','--json'],{capture:true}));
    database=dbs.find(d=>d.name==='opening-stock-watch');
  }
  if(!database?.uuid)throw new Error(t(env.MESSAGE_LANGUAGE, 'databaseMissing'));
  const config=deploymentConfig(JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8')), env, database.uuid);
  writeFileSync(configPath,JSON.stringify(config,null,2));
  await run(['d1','migrations','apply','DB','--remote','--config',configPath.pathname]);
  await run(['deploy','--config',configPath.pathname]);
  const secrets=Object.fromEntries(secretNames.map(k=>[k,env[k]]));
  await run(['secret','bulk','--config',configPath.pathname],{input:JSON.stringify(secrets)});
  console.log(t(env.MESSAGE_LANGUAGE, 'deployed'));
}catch(e){console.error(e.message);process.exitCode=1;}
