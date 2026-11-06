import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVolumeEvents, windowStats, nyInstant, formatReport } from '../src/core.js';
import { buildReport } from '../src/alpaca.js';
import { bars, environment, mockFetch } from './fixtures.js';

function stats(date, volumes, overrides={}) {
  const input=bars(date,'09:30',volumes.length).map((b,i)=>({...b,v:volumes[i],...overrides}));
  return windowStats(input,nyInstant(date,'09:30'),nyInstant(date,'09:30')+volumes.length*60000);
}
const history=(volumes)=>['2026-10-28','2026-10-29','2026-10-30','2026-11-02','2026-11-03'].map(date=>({date,stats:stats(date,volumes)}));

test('absolute share threshold works even without a baseline; dollars are not share volume',()=>{
  const r=analyzeVolumeEvents(stats('2026-11-04',[10_000_000,9_999_999,1_000],{vw:20_000}),[]);
  assert.equal(r.largeCount,1);assert.equal(r.unusualCount,0);assert.equal(r.baselineMissing,3);
  assert.equal(r.events[0].shares,10_000_000);assert.equal(r.events[0].estimatedNotional,200_000_000_000);
  assert.equal(r.events[0].ratio,null);
});

test('relative spikes compare the same Eastern minute across DST and use the median',()=>{
  const prior=history([100,1000]);prior[0].stats=stats(prior[0].date,[1_000_000,1000]);
  const r=analyzeVolumeEvents(stats('2026-11-04',[500,4999]),prior);
  assert.equal(r.largeCount,0);assert.equal(r.unusualCount,1);
  assert.equal(r.events[0].shares,500);assert.equal(r.events[0].ratio,5);assert.equal(r.events[0].baselineCount,5);
});

test('requires three complete historical samples and a positive baseline',()=>{
  const current=stats('2026-11-04',[1_000_000]);
  assert.equal(analyzeVolumeEvents(current,history([100]).slice(0,2)).unusualCount,0);
  const prior=history([100]);prior[0].stats.complete=false;prior[1].stats.complete=false;prior[2].stats.complete=false;
  assert.equal(analyzeVolumeEvents(current,prior).unusualCount,0);
  assert.equal(analyzeVolumeEvents(current,history([0])).baselineMissing,1);
  current.complete=false;
  assert.equal(analyzeVolumeEvents(current,history([100])).eventCount,0);
});

test('missing VWAP does not hide a share-volume alert; truncated events retain total and overlap counts',()=>{
  const current=stats('2026-11-04',[10e6,11e6,12e6,13e6],{vw:undefined});
  const r=analyzeVolumeEvents(current,history([100,100,100,100]));
  assert.equal(r.eventCount,4);assert.equal(r.largeCount,4);assert.equal(r.unusualCount,4);
  assert.deepEqual(r.events.map(x=>x.shares),[13e6,12e6,11e6]);
  assert.equal(r.events[0].estimatedNotional,null);
  assert.equal(r.events[0].large,true);assert.equal(r.events[0].unusual,true);
});

test('large-volume down/up/flat minutes report price changes without inferring buyer identity',()=>{
  for(const [close,expected] of [[90,-10],[100,0],[110,10]]) {
    const current=stats('2026-11-04',[10e6],{o:100,h:110,l:90,c:close,vw:100});
    const event=analyzeVolumeEvents(current,[]).events[0];assert.ok(Math.abs(event.change-expected)<1e-8);
  }
});

test('configured thresholds reach reporting, removed plots stay absent and max watchlist fits Telegram',async()=>{
  const symbols=Array.from({length:15},(_,i)=>`A${i}`);
  for(const language of ['en','zh']) {
    const env={...environment(),MESSAGE_LANGUAGE:language,LARGE_MINUTE_SHARES:'1000',UNUSUAL_VOLUME_MULTIPLE:'2'};
    const report=await buildReport(env,'2026-09-08',symbols,nyInstant('2026-09-08','10:16'),mockFetch());
    assert.equal(report.stocks[0].volumeEvents.largeCount,30);
    assert.equal(report.stocks[0].volumeEvents.events.length,3);
    const text=report.chunks.join('\n');assert.doesNotMatch(text,/每5分钟|5-minute prices|5-minute volumes|分段量|Bucket volumes/);
    assert.match(text,language==='en'?/Minute-volume events/:/分钟成交异动/);
    assert.match(text,language==='en'?/not a single block trade/:/不是单笔大单/);
    if(language==='en')assert.doesNotMatch(text,/\p{Script=Han}/u);
    assert.ok(report.chunks.length>1);for(const chunk of report.chunks)assert.ok(chunk.length<=4096);
  }
  await assert.rejects(()=>buildReport({...environment(),LARGE_MINUTE_SHARES:'not-a-number'},'2026-09-08',['SPY'],nyInstant('2026-09-08','10:16'),mockFetch()),/LARGE_MINUTE_SHARES/);
});
