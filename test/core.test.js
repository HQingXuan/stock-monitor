import test from 'node:test';
import assert from 'node:assert/strict';
import { nyInstant, nyParts, scheduledWindow, windowStats, analyzeStock, percent, validateSymbols } from '../src/core.js';
import { bars } from './fixtures.js';

test('New York scheduling handles both DST offsets, not machine timezone', () => {
  assert.equal(new Date(nyInstant('2026-09-08','10:16')).toISOString(), '2026-09-08T14:16:00.000Z');
  assert.equal(new Date(nyInstant('2026-12-08','10:16')).toISOString(), '2026-12-08T15:16:00.000Z');
  assert.equal(scheduledWindow(Date.parse('2026-12-08T14:16:00Z')), false);
  assert.equal(scheduledWindow(Date.parse('2026-12-08T15:16:00Z')), true);
  assert.equal(nyParts('2026-09-09T00:00:00Z').date, '2026-09-08');
});

test('window excludes premarket and 10:00 bar; volumes are non-cumulative buckets', () => {
  const start = nyInstant('2026-09-08','09:30');
  const input = [...bars('2026-09-08','09:29',1), ...bars('2026-09-08'), ...bars('2026-09-08','10:00',1)];
  const s = windowStats(input, start, start+1800000);
  assert.equal(s.complete, true);
  assert.equal(s.volume, 34350);
  assert.equal(s.buckets.length, 6);
  assert.equal(s.buckets[0].volume, 5100);
  assert.equal(s.buckets[5].volume, 6350);
  assert.equal(s.price, 103);
});

test('missing, duplicate, nonfinite and impossible bars cannot produce a direction', () => {
  const start = nyInstant('2026-09-08','09:30');
  for (const input of [bars('2026-09-08').slice(1), [...bars('2026-09-08'),bars('2026-09-08')[0]],
    bars('2026-09-08').map((x,i)=> i===4 ? {...x,c:NaN} : x),
    bars('2026-09-08').map((x,i)=> i===4 ? {...x,v:-1} : x)]) {
    const s = windowStats(input,start,start+1800000);
    assert.equal(s.complete,false); assert.equal(s.price,null); assert.equal(s.volume,null);
  }
});

test('volume baseline uses valid matching windows and needs >=3 days', () => {
  const current = { price: 105, volume: 300, complete: true };
  const prior = [100,200,300].map((v,i)=>({date:`2026-09-0${3-i}`,stats:{price:100,volume:v,complete:true}}));
  let r = analyzeStock('SPY', current, prior, {price:100});
  assert.equal(r.volumeRatio,1.5); assert.equal(r.volumeVsPrevious,200);
  assert.ok(Math.abs(r.changeFromPreviousClose-5)<1e-8);
  r = analyzeStock('SPY',current,prior.slice(0,2),null);
  assert.equal(r.volumeRatio,null); assert.equal(r.changeFromPreviousClose,null);
  assert.equal(percent(1,0),null);
});

test('watch symbols normalize, deduplicate, reject oversized lists/injection', () => {
  assert.deepEqual(validateSymbols([' spy ','SPY','BRK.B']),['SPY','BRK.B']);
  assert.throws(()=>validateSymbols(['SPY;DELETE']));
  assert.throws(()=>validateSymbols(Array.from({length:16},(_,i)=>`A${i}`)));
});
