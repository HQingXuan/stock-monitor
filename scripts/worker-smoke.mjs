// Optional real workerd/D1 check with mocked outbound APIs. No credentials or cloud account.
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mockFetch } from '../test/fixtures.js';
const require=createRequire(realpathSync(new URL('../node_modules/wrangler/package.json',import.meta.url)));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {build}=require('esbuild');
const compiled=await build({entryPoints:[new URL('../src/worker.js',import.meta.url).pathname],bundle:true,format:'esm',write:false});
for(const language of ['zh','en']) {
const log=[];
const outbound=mockFetch(log);
const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-09-05',
  d1Databases:{DB:'smoke-test'},
  bindings:{MESSAGE_LANGUAGE:language,INITIAL_SYMBOLS:'SPY,QQQ,TQQQ,GOOG',INITIAL_DAYS:'7',ALPACA_KEY:'fake',ALPACA_SECRET:'fake',
    ADMIN_TOKEN:'fake-admin',TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_CHAT_ID:'123',TELEGRAM_WEBHOOK_SECRET:'fake-webhook'},
  outboundService: async request=>outbound(request.url,{body:request.method==='POST' ? await request.text() : undefined}),
}));
try {
  const db=await mf.getD1Database('DB');
  for(const sql of readFileSync(new URL('../migrations/0001.sql',import.meta.url),'utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  assert.equal((await mf.dispatchFetch('https://bot/health')).status,200);
  assert.equal((await mf.dispatchFetch('https://bot/api/status')).status,401);
  const response=await mf.dispatchFetch('https://bot/api/preview',{
    method:'POST',headers:{Authorization:'Bearer fake-admin','content-type':'application/json'},
    body:JSON.stringify({date:'2026-09-04',symbols:['SPY','QQQ','TQQQ','GOOG']})
  });
  const report=await response.json();assert.equal(response.status,200,JSON.stringify(report));
  assert.equal(report.language,language);
  if(language==='en')assert.doesNotMatch(report.chunks.join(''),/\p{Script=Han}/u);
  assert.equal(report.stocks.length,4);assert.equal(report.stocks[0].current.complete,true);
  const update=await mf.dispatchFetch('https://bot/telegram',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'fake-webhook'},body:JSON.stringify({update_id:1,message:{chat:{type:'private',id:123},from:{id:123},text:'/watch AAPL 30'}})});
  assert.equal(update.status,200);
  assert.equal((await db.prepare("SELECT symbol FROM watches WHERE symbol='AAPL'").first()).symbol,'AAPL');
  const sent=log.filter(x=>x.url.hostname==='api.telegram.org');
  assert.equal(sent.length,1);
  if(language==='en')assert.doesNotMatch(JSON.parse(sent[0].options.body).text,/\p{Script=Han}/u);
  console.log(language, '✓ Actual workerd runtime + D1 migration + protected preview + Telegram watch command passed (mocked APIs).');
}finally{await mf.dispose();}
}
