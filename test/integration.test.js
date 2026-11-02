import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { initialize, activeSymbols, handleCommand, runDaily, deliver } from '../src/worker.js';
import { buildReport, alpacaClient } from '../src/alpaca.js';
import { environment, mockFetch, bars } from './fixtures.js';
import { nyInstant } from '../src/core.js';

const now = Date.parse('2026-09-08T14:16:00Z');

test('report uses SIP only, bounded windows, adjusted same-period history and close reference', async () => {
  const log=[];
  const r = await buildReport(environment(),'2026-09-08',['SPY','QQQ'],now,mockFetch(log));
  assert.equal(r.stocks.length,2); assert.equal(r.stocks[0].current.complete,true);
  assert.equal(r.stocks[0].baselineCount,5);
  assert.equal(log.length,8);
  for (const {url} of log.filter(x=>x.url.pathname.endsWith('/bars'))) {
    assert.equal(url.searchParams.get('feed'),'sip');
    assert.equal(url.searchParams.get('adjustment'),'split');
    assert.ok(Date.parse(url.searchParams.get('end'))<now-15*60000);
  }
  assert.ok(r.chunks[0].includes('全市场')); assert.ok(r.chunks[0].includes('不代表发送时现价'));
});

test('holiday skips all market data and Telegram calls',async()=>{
  const log=[]; const r=await buildReport(environment(),'2026-09-07',['SPY'],now,mockFetch(log));
  assert.equal(r.holiday,true); assert.equal(log.length,1);
});

test('multi-symbol pagination is fully collected, never silently switches feed on 403',async()=>{
  const env=environment(); let n=0;
  const fetcher=async()=>Response.json(++n===1 ? {bars:{SPY:bars('2026-09-08')},next_page_token:'next'} : {bars:{QQQ:bars('2026-09-08')},next_page_token:null});
  const c=alpacaClient(env,fetcher),start=nyInstant('2026-09-08','09:30');
  const r=await c.bars(['SPY','QQQ'],start,start+1800000,now);
  assert.equal(r.SPY.length,30);assert.equal(r.QQQ.length,30);
  let calls=0;
  await assert.rejects(()=>alpacaClient(env,async()=>{calls++;return new Response('',{status:403});}).bars(['SPY'],start,start+1800000,now),/不会降级到 IEX/);
  assert.equal(calls,1);
  await assert.rejects(()=>c.bars(['SPY'],start,start+1800000,now-60001),/延迟/);
});

test('early close uses 12:59 rather than 15:59 for previous close',async()=>{
  const log=[]; const original=mockFetch(log);
  const f=async(url,opts)=> {
    if(url.includes('/calendar')) return Response.json([{date:'2026-11-27',open:'09:30',close:'13:00'},{date:'2026-11-30',open:'09:30',close:'16:00'}]);
    if(url.includes('/bars')) {
      const u=new URL(url);const start=u.searchParams.get('start');log.push({url:u});
      return Response.json({bars:{SPY:bars(start.slice(0,10),start.includes('17:59')?'12:59':'09:30',start.includes('17:59')?1:30)},next_page_token:null});
    }
    return original(url,opts);
  };
  const r=await buildReport(environment(),'2026-11-30',['SPY'],Date.parse('2026-11-30T15:16:00Z'),f);
  assert.equal(r.stocks[0].previousClose.barTime,'2026-11-27T17:59:00.000Z');
});

test('D1 seeding is once; watch duration inclusive; stopped symbols stay stopped',async()=>{
  const env=environment();await initialize(env,'2026-09-08');
  assert.equal((await activeSymbols(env,'2026-09-14')).length,4);
  assert.equal((await activeSymbols(env,'2026-09-15')).length,0);
  await handleCommand(env,'/stop SPY','2026-09-08');await initialize(env,'2026-09-09');
  assert.equal((await activeSymbols(env,'2026-09-09')).includes('SPY'),false);
  await handleCommand(env,'/watch SPY 30','2026-09-09');
  assert.equal((await activeSymbols(env,'2026-10-08')).includes('SPY'),true);
  assert.equal((await activeSymbols(env,'2026-10-09')).includes('SPY'),false);
});

test('daily retry does not resend confirmed messages',async()=>{
  const env=environment(),log=[],f=mockFetch(log);
  assert.equal((await runDaily(env,now,f)).status,'sent');
  assert.equal((await runDaily(env,now+60000,f)).status,'already-handled-or-running');
  assert.equal(log.filter(x=>x.url.hostname==='api.telegram.org').length,1);
});

test('15-watch cap also blocks reactivation of an expired extra symbol',async()=>{
  const env=environment();await initialize(env,'2026-09-08');
  await handleCommand(env,'/watch OLD 1','2026-09-08');
  await handleCommand(env,'/watch A,B,C,D,E,F,G,H,I,J,K 7','2026-09-09');
  assert.equal((await activeSymbols(env,'2026-09-09')).length,15);
  const reply=await handleCommand(env,'/watch OLD 7','2026-09-09');
  assert.ok(reply.includes('未添加：OLD'));
  assert.equal((await activeSymbols(env,'2026-09-09')).length,15);
});

test('uncertain delivery is not resent automatically; explicit API rejection can retry',async()=>{
  const env=environment();let calls=0;
  const f=async()=>{calls++;throw new Error('timeout');};
  assert.equal(await deliver(env,'2026-09-08',['hello'],f),'uncertain');
  assert.equal(await deliver(env,'2026-09-08',['hello'],f),'uncertain');assert.equal(calls,1);
  assert.equal(await deliver(env,'2026-09-09',['hello'],async()=>Response.json({ok:false},{status:429})),'retry');
  assert.equal(await deliver(env,'2026-09-09',['hello'],mockFetch()),'sent');
});

test('HTTP admin and webhook reject unauthenticated callers and other Telegram users',async()=>{
  const env=environment();
  assert.equal((await worker.fetch(new Request('https://bot/api/status'),env)).status,401);
  assert.equal((await worker.fetch(new Request('https://bot/telegram',{method:'POST',body:'{}'}),env)).status,401);
  const r=await worker.fetch(new Request('https://bot/telegram',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'fixture-webhook'},body:JSON.stringify({update_id:1,message:{chat:{type:'private',id:999},from:{id:999},text:'/watch AAPL 7'}})}),env);
  assert.equal(r.status,200);assert.equal((await activeSymbols(env,'2026-09-08')).length,0);
});
