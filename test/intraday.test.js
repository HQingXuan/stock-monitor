import test from 'node:test';
import assert from 'node:assert/strict';
import { nyInstant, nyParts } from '../src/core.js';
import { buildReport } from '../src/alpaca.js';
import { runDaily } from '../src/worker.js';
import { environment, bars, sessions } from './fixtures.js';

function market(log = [], earlyDate = null) {
  return async (raw, options) => {
    const url = new URL(raw); log.push({ url, options });
    if (url.pathname.endsWith('/calendar')) return Response.json(sessions.map(date => ({ date, open: '09:30', close: date === earlyDate ? '13:00' : '16:00' })));
    if (url.hostname === 'api.telegram.org') return Response.json({ ok: true, result: { message_id: log.length } });
    const start = Date.parse(url.searchParams.get('start'));
    const end = Date.parse(url.searchParams.get('end')) + 1;
    const { date, hour, minute } = nyParts(start);
    return Response.json({ bars: Object.fromEntries(url.searchParams.get('symbols').split(',').map(s => [s, bars(date, `${hour}:${minute}`, (end-start)/60000)])) });
  };
}

test('all three slots send independently once and retries preserve fixed windows', async () => {
  const env = environment(), log = [], fetcher = market(log);
  for (const clock of ['10:16','12:00','15:30']) {
    const now = nyInstant('2026-09-08',clock);
    assert.equal((await runDaily(env,now,fetcher)).status,'sent');
    assert.equal((await runDaily(env,now+60000,fetcher)).status,'already-handled-or-running');
  }
  const rows = (await env.DB.prepare('SELECT date,body FROM reports').all()).results;
  assert.equal(rows.length,3);
  const noon = JSON.parse(rows.find(r=>r.date.endsWith('-noon')).body);
  assert.equal(noon.stocks[0].current.expected,134);
  const afternoon = JSON.parse(rows.find(r=>r.date.endsWith('-afternoon')).body);
  assert.equal(afternoon.stocks[0].current.expected,344);
  assert.equal(afternoon.stocks[0].current.complete,true);
  assert.equal(afternoon.stocks[0].baselineCount,5);
  assert.ok(afternoon.chunks[0].includes('15:14'));
  assert.ok(afternoon.chunks[0].includes('开盘以来变化'));
  assert.equal(log.filter(x=>x.url.hostname==='api.telegram.org').length,3);
  const retry = await buildReport(env,'2026-09-08',['SPY'],nyInstant('2026-09-08','12:10'),fetcher,'noon');
  assert.equal(retry.windowEndExclusive,noon.windowEndExclusive);
});

test('early close caps current report; shorter historical sessions are excluded from baseline',async()=>{
  const now = nyInstant('2026-09-08','15:30');
  const r = await buildReport(environment(),'2026-09-08',['SPY'],now,market([],'2026-09-08'),'afternoon');
  assert.equal(r.stocks[0].current.expected,210);
  assert.equal(r.stocks[0].current.complete,true);
  assert.ok(r.chunks[0].includes('13:00'));
  const log = [];
  const h = await buildReport(environment(),'2026-09-08',['SPY'],now,market(log,'2026-09-04'),'afternoon');
  assert.equal(h.stocks[0].baselineCount,4);
  assert.equal(h.stocks[0].volumeVsPrevious,null);
  assert.equal(h.stocks[0].previousClose.barTime,new Date(nyInstant('2026-09-04','12:59')).toISOString());
});

test('new slots skip holidays and expired watches; final failure notifications are per slot',async()=>{
  for (const clock of ['12:00','15:30']) {
    const log=[];
    assert.equal((await runDaily(environment(),nyInstant('2026-09-07',clock),market(log))).status,'holiday');
    assert.equal(log.filter(x=>x.url.hostname==='api.telegram.org').length,0);
  }
  const env=environment(); const messages=[];
  const fail=async(raw,options)=> {
    if(new URL(raw).hostname==='api.telegram.org') { messages.push(JSON.parse(options.body).text); return Response.json({ok:true,result:{message_id:messages.length}}); }
    return new Response('',{status:403});
  };
  for(const clock of ['12:10','15:40']) await runDaily(env,nyInstant('2026-09-08',clock),fail);
  assert.equal(messages.length,2);
  assert.ok(messages[0].includes('午间总结')); assert.ok(messages[1].includes('下午总结'));
  assert.equal((await runDaily(env,nyInstant('2026-09-16','12:00'),market())).status,'no-active-watches');
});
