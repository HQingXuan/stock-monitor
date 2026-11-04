import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { messages, languageOf } from '../src/messages.js';
import { buildReport } from '../src/alpaca.js';
import { nyInstant, windowStats, formatReport } from '../src/core.js';
import worker, { initialize, handleCommand, runDaily } from '../src/worker.js';
import { deploymentConfig, requireSecrets } from '../scripts/env.mjs';
import { environment, mockFetch, bars } from './fixtures.js';

const date='2026-09-08', now=nyInstant(date,'10:16');
const noChinese = text => assert.doesNotMatch(text,/\p{Script=Han}/u);

test('catalog translations have matching interpolation fields; old deployments default to Chinese',()=>{
  assert.equal(languageOf(undefined),'zh');
  assert.throws(()=>languageOf('fr'),/MESSAGE_LANGUAGE/);
  for(const [key, pair] of Object.entries(messages)) {
    assert.ok(pair.en && pair.zh,key);
    const fields = text => [...new Set(text.match(/\{\w+\}/g) || [])].sort();
    assert.deepEqual(fields(pair.en),fields(pair.zh),key);
    noChinese(pair.en);
  }
});

test('all report slots use selected language without altering numeric analysis',async()=>{
  for(const [slot,clock] of [['opening','10:16'],['noon','12:00'],['afternoon','15:30']]) {
    const en=await buildReport({...environment(),MESSAGE_LANGUAGE:'en'},date,['SPY'],nyInstant(date,clock),mockFetch(),slot);
    const zh=await buildReport(environment(),date,['SPY'],nyInstant(date,clock),mockFetch(),slot);
    assert.equal(en.language,'en');
    noChinese(en.chunks.join('\n'));
    assert.match(en.chunks[0],new RegExp(messages[slot].en));
    assert.match(zh.chunks[0],/股票/);
    assert.equal(en.stocks[0].current.volume,zh.stocks[0].current.volume);
    // The existing 30-bar fixture deliberately produces missing data for the intraday slots.
    if(slot!=='opening') assert.match(en.chunks[0],/Minute coverage/);
  }
  const report=await buildReport({...environment(),MESSAGE_LANGUAGE:'en'},date,['SPY'],now,mockFetch());
  const start=nyInstant(date,'09:30');
  report.slot='noon';report.windowEndExclusive=new Date(nyInstant(date,'11:44')).toISOString();
  report.stocks[0].current=windowStats(bars(date,'09:30',134),start,nyInstant(date,'11:44'),'en');
  const text=formatReport(report).join('\n');
  noChinese(text);assert.match(text,/Change since open/);assert.match(text,/last bucket: 4 minutes/);assert.match(text,/Window high\/low/);
});

test('missing, duplicate and invalid bars explain errors in English',()=>{
  const start=nyInstant(date,'09:30');
  for(const input of [bars(date).slice(1),[...bars(date),bars(date)[0]],bars(date).map((b,i)=>i===0?{...b,v:-1}:b)]) {
    const result=windowStats(input,start,start+30*60000,'en');
    assert.equal(result.complete,false);noChinese(result.issues.join(' '));
  }
});

test('English Telegram commands and validation errors use one language',async()=>{
  const env={...environment(),MESSAGE_LANGUAGE:'en'};
  await initialize(env,date);
  for(const command of ['/start','/list','/status','/watch AAPL 30','/stop AAPL','/unknown']) noChinese(await handleCommand(env,command,date));
  assert.match(await handleCommand(env,'/watch AAPL 30',date),/Watching through/);
  for(const command of ['/watch bad!','/watch SPY 0','/stop bad!']) {
    await assert.rejects(()=>handleCommand(env,command,date),error=>{noChinese(error.message);return true;});
  }
  await handleCommand(env,'/watch A,B,C,D,E,F,G,H,I,J 7',date);
  assert.match(await handleCommand(env,'/watch Z 7',date),/15-symbol limit/);
  assert.throws(()=>requireSecrets({MESSAGE_LANGUAGE:'en'}),/Missing ALPACA_KEY/);
});

test('English scheduled failure, saved status and HTTP errors are localized',async()=>{
  const env={...environment(),MESSAGE_LANGUAGE:'en'}, sent=[];
  const fail=async(url,options)=> {
    if(new URL(url).hostname==='api.telegram.org') {sent.push(JSON.parse(options.body).text);return Response.json({ok:true,result:{message_id:1}});}
    return new Response('',{status:403});
  };
  const result=await runDaily(env,nyInstant(date,'12:10'),fail);
  assert.match(result.error,/Insufficient SIP/);noChinese(sent[0]);assert.match(sent[0],/Midday summary failed/);
  noChinese(await handleCommand(env,'/status',date));
  for(const [path, options] of [
    ['/api/status',{}],
    ['/api/report?slot=bad',{headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`}}],
    ['/api/preview',{method:'POST',headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`},body:JSON.stringify({date:'bad'})}]
  ]) {
    const response=await worker.fetch(new Request('https://bot'+path,options),env);
    assert.ok(response.status>=400);noChinese((await response.json()).error);
  }
});

test('saved reports retain original language and delivery deduplication after switching language',async()=>{
  const env={...environment(),MESSAGE_LANGUAGE:'en'},log=[];
  await runDaily(env,now,mockFetch(log));env.MESSAGE_LANGUAGE='zh';
  assert.equal((await runDaily(env,now+60000,mockFetch(log))).status,'already-handled-or-running');
  assert.equal(log.filter(x=>x.url.hostname==='api.telegram.org').length,1);
  const stored=await env.DB.prepare('SELECT body FROM reports WHERE date=?').bind(date).first();
  assert.equal(JSON.parse(stored.body).language,'en');
});

test('language survives setup selection, rerun, env loading and deployment config generation',()=>{
  const root=new URL('../',import.meta.url);
  const script=readFileSync(new URL('scripts/setup.sh',root),'utf8');
  // Exercise the actual wizard library and language chooser without running browser/deployment stages.
  const library=script.slice(0,script.indexOf('TOTAL_STAGES=6'));
  const chooser=readFileSync(new URL('scripts/setup-language.sh',root),'utf8');
  const dir=mkdtempSync(join(tmpdir(),'stock-language-'));
  try {
    mkdirSync(join(dir,'scripts'));mkdirSync(join(dir,'src'));
    writeFileSync(join(dir,'package.json'),JSON.stringify({type:'module'}));
    copyFileSync(new URL('scripts/env.mjs',root),join(dir,'scripts/env.mjs'));
    copyFileSync(new URL('src/messages.js',root),join(dir,'src/messages.js'));
    for(const [input,expected] of [['bad\nen\n','en'],['\n','en'],['2\n','zh'],['\n','zh']]) {
      const env={...process.env,ENV_FILE:join(dir,'.setup.env')};delete env.MESSAGE_LANGUAGE;
      const result=spawnSync('bash',['-c',library+'\numask 077\n'+chooser+'\nchoose_language'],{env,input,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      const saved=readFileSync(env.ENV_FILE,'utf8');
      assert.match(saved,new RegExp(`MESSAGE_LANGUAGE=${expected}`));
      assert.equal(statSync(env.ENV_FILE).mode & 0o777,0o600);
      const loaded=spawnSync(process.execPath,['--input-type=module','-e',"import {loadEnv} from './scripts/env.mjs'; console.log(loadEnv().MESSAGE_LANGUAGE);"],{cwd:dir,env,encoding:'utf8'});
      assert.equal(loaded.status,0,loaded.stderr);assert.equal(loaded.stdout.trim(),expected);
      const config=deploymentConfig({vars:{INITIAL_DAYS:'7'},d1_databases:[{binding:'DB'}]},{MESSAGE_LANGUAGE:expected},'fixture-database');
      assert.equal(config.vars.MESSAGE_LANGUAGE,expected);assert.equal(config.vars.INITIAL_DAYS,'7');
    }
    const before=readFileSync(join(dir,'.setup.env'),'utf8');
    const cancelled=spawnSync('bash',['-c',library+'\n'+chooser+'\nchoose_language'],{env:{...process.env,ENV_FILE:join(dir,'.setup.env')},input:'',encoding:'utf8'});
    assert.notEqual(cancelled.status,0);assert.equal(readFileSync(join(dir,'.setup.env'),'utf8'),before);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('Telegram setup test notification uses selected language and all three times',()=>{
  const script=new URL('../scripts/telegram-setup.mjs',import.meta.url).href;
  for(const language of ['en','zh']) {
    const result=spawnSync(process.execPath,['--input-type=module','-e',`
      globalThis.fetch=async(url,options)=>{console.log(JSON.parse(options.body).text);return Response.json({ok:true,result:{message_id:1}});};
      process.argv[2]='test';await import(${JSON.stringify(script)});
    `],{encoding:'utf8',env:{...process.env,MESSAGE_LANGUAGE:language,TELEGRAM_CHAT_ID:'123',TELEGRAM_BOT_TOKEN:'fixture-token'}});
    assert.equal(result.status,0,result.stderr);
    for(const clock of ['10:16','12:00','15:30'])assert.ok(result.stdout.includes(clock));
    if(language==='en')noChinese(result.stdout);else assert.match(result.stdout,/测试消息/);
  }
});
