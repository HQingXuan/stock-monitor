import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { nyInstant, addDays } from '../src/core.js';

export function bars(date, clock = '09:30', count = 30, base = 100, volume = 1000) {
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(nyInstant(date, clock) + i * 60000).toISOString(),
    o: base + i * 0.1, h: base + i * 0.1 + 0.2, l: base + i * 0.1 - 0.1,
    c: base + i * 0.1 + 0.1, v: volume + i * 10, n: 50, vw: base + i * 0.1
  }));
}

export function db() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      let params = [];
      const prepared = {
        bind(...values) { params = values; return prepared; },
        async run() { const r = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
        async first() { return sqlite.prepare(sql).get(...params) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; }
      };
      return prepared;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    }
  };
}

export const sessions = ['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-08'];
export function mockFetch(log = []) {
  return async (rawUrl, options) => {
    const url = new URL(rawUrl);
    log.push({ url, options });
    if (url.pathname.endsWith('/calendar')) {
      return Response.json(sessions.filter(d => d <= url.searchParams.get('end')).map(date => ({ date, open: '09:30', close: '16:00' })));
    }
    if (url.hostname === 'api.telegram.org') return Response.json({ ok: true, result: { message_id: log.length } });
    if (url.pathname.endsWith('/bars')) {
      const start = url.searchParams.get('start');
      const date = start.slice(0,10);
      const isClose = start.includes('19:59');
      const data = Object.fromEntries(url.searchParams.get('symbols').split(',').map(s =>
        [s, bars(date, isClose ? '15:59' : '09:30', isClose ? 1 : 30, 100, 1000 + sessions.indexOf(date) * 100)]));
      return Response.json({ bars: data, next_page_token: null });
    }
    throw new Error(`Unexpected test URL ${url}`);
  };
}

export function environment() {
  return { DB: db(), INITIAL_SYMBOLS: 'SPY,QQQ,TQQQ,GOOG', INITIAL_DAYS: '7',
    ALPACA_KEY: 'fixture-key', ALPACA_SECRET: 'fixture-secret', TELEGRAM_BOT_TOKEN: 'fixture-token',
    TELEGRAM_CHAT_ID: '123', ADMIN_TOKEN: 'fixture-admin', TELEGRAM_WEBHOOK_SECRET: 'fixture-webhook' };
}
