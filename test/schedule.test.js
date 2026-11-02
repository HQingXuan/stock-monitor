import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { nyInstant, scheduledWindow } from '../src/core.js';
import { initialize, runDaily } from '../src/worker.js';
import { environment, mockFetch, sessions } from './fixtures.js';

// Cloudflare Cron uses 1=SUN ... 7=SAT, unlike Unix cron.
// https://developers.cloudflare.com/workers/configuration/cron-triggers/
const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function matchesField(field, value) {
  const number = token => weekdays.includes(token) ? weekdays.indexOf(token) + 1 : Number(token);
  return field === '*' || field.split(',').some(part => {
    const bounds = part.split('-').map(number);
    assert.ok(bounds.every(Number.isFinite), `Unsupported cron field: ${field}`);
    return value >= bounds[0] && value <= (bounds[1] ?? bounds[0]);
  });
}
function fires(crons, time) {
  const d = new Date(time);
  const values = [d.getUTCMinutes(), d.getUTCHours(), d.getUTCDate(), d.getUTCMonth()+1, d.getUTCDay()+1];
  return crons.some(cron => cron.split(/\s+/).every((field, i) => matchesField(field, values[i])));
}

for (const file of ['wrangler.jsonc', 'wrangler.local.json']) {
  const path = new URL(`../${file}`, import.meta.url);
  if (!existsSync(path)) continue;
  const { triggers: { crons } } = JSON.parse(readFileSync(path, 'utf8'));
  test(`${file}: weekday coverage includes Friday and excludes weekends in both DST seasons`, () => {
    for (const sunday of ['2026-09-06', '2026-11-08']) {
      for (let day=0; day<7; day++) {
        const date = new Date(Date.parse(`${sunday}T12:00:00Z`) + day*86400000).toISOString().slice(0,10);
        let executions = 0;
        for (let minute=0; minute<60; minute++) {
          const time = nyInstant(date, `10:${String(minute).padStart(2,'0')}`);
          if (fires(crons,time) && scheduledWindow(time)) executions++;
        }
        assert.equal(executions, day>=1 && day<=5 ? 11 : 0, `${date}: expected weekday retry window`);
      }
    }
  });
  test(`${file}: configured Friday trigger reaches report generation and sends once`, async () => {
    const env = environment(), log = [], base = mockFetch(log);
    await initialize(env,'2026-09-06'); // Same expiry as the production incident.
    const fetcher = async (url, options) => url.includes('/calendar')
      ? Response.json([...sessions,'2026-09-09','2026-09-10','2026-09-11'].map(date => ({date,open:'09:30',close:'16:00'})))
      : base(url, options);
    for (let minute=16; minute<=26; minute++) {
      const time = nyInstant('2026-09-11', `10:${minute}`);
      if (fires(crons,time)) await runDaily(env,time,fetcher);
    }
    const row = await env.DB.prepare('SELECT status FROM reports WHERE date=?').bind('2026-09-11').first();
    assert.equal(row?.status,'sent','Friday must produce and send a report');
    assert.equal(log.filter(x => x.url.hostname==='api.telegram.org').length,1);
  });
}
