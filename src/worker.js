import { t } from './messages.js';
import { addDays, nyParts, scheduledSlot, reportSlots, reportKey, validateSymbols } from './core.js';
import { buildReport } from './alpaca.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const stamp = () => new Date().toISOString();

export async function initialize(env, date) {
  // INSERT OR IGNORE and conditional seed occur atomically in one D1 batch.
  const symbols = validateSymbols((env.INITIAL_SYMBOLS || 'SPY,QQQ,TQQQ,GOOG').split(','), env.MESSAGE_LANGUAGE);
  const days = Number(env.INITIAL_DAYS || 7);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error(t(env.MESSAGE_LANGUAGE, 'initialDays'));
  await env.DB.batch([
    ...symbols.map(s => env.DB.prepare(`INSERT OR IGNORE INTO watches SELECT ?,?,?
      WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key='initialized')`).bind(s, date, addDays(date, days - 1))),
    env.DB.prepare("INSERT OR IGNORE INTO settings VALUES ('initialized',?)").bind(date)
  ]);
}

export async function activeSymbols(env, date) {
  const result = await env.DB.prepare('SELECT symbol FROM watches WHERE starts_on<=? AND expires_on>=? ORDER BY symbol').bind(date, date).all();
  return result.results.map(x => x.symbol);
}

async function sendTelegram(env, text, fetcher = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error(t(env.MESSAGE_LANGUAGE, 'missingTelegram'));
  // Never log request URLs: Telegram embeds credentials in the URL.
  const response = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(15000)
  });
  let body;
  try { body = await response.json(); } catch { throw new Error(t(env.MESSAGE_LANGUAGE, 'telegramUncertain')); }
  if (!body.ok) return { ok: false, status: response.status };
  return { ok: true, messageId: String(body.result.message_id) };
}

export async function deliver(env, date, chunks, fetcher = fetch) {
  for (let part = 0; part < chunks.length; part++) {
    await env.DB.prepare("INSERT OR IGNORE INTO deliveries VALUES (?,?,'pending',NULL)").bind(date, part).run();
    const claimed = await env.DB.prepare("UPDATE deliveries SET status='sending' WHERE report_date=? AND part=? AND status='pending'").bind(date, part).run();
    if (!claimed.meta.changes) {
      const row = await env.DB.prepare('SELECT status FROM deliveries WHERE report_date=? AND part=?').bind(date, part).first();
      if (row.status === 'sent') continue;
      return 'uncertain'; // A prior interrupted send cannot safely be repeated automatically.
    }
    let result;
    try { result = await sendTelegram(env, chunks[part], fetcher); }
    catch {
      await env.DB.prepare("UPDATE deliveries SET status='uncertain' WHERE report_date=? AND part=?").bind(date, part).run();
      return 'uncertain';
    }
    if (!result.ok) {
      await env.DB.prepare("UPDATE deliveries SET status='pending' WHERE report_date=? AND part=?").bind(date, part).run();
      return 'retry';
    }
    await env.DB.prepare("UPDATE deliveries SET status='sent', message_id=? WHERE report_date=? AND part=?").bind(result.messageId, date, part).run();
  }
  return 'sent';
}

export async function runDaily(env, now = Date.now(), fetcher = fetch) {
  const slot = scheduledSlot(now);
  if (!slot) return { status: 'outside-window' };
  const { date } = nyParts(now);
  const key = reportKey(date, slot, env.MESSAGE_LANGUAGE);
  await initialize(env, date);
  const symbols = await activeSymbols(env, date);
  if (!symbols.length) return { status: 'no-active-watches' };
  await env.DB.prepare("INSERT OR IGNORE INTO reports (date,status,updated_at) VALUES (?,'pending',?)").bind(key, stamp()).run();
  const claim = await env.DB.prepare(`UPDATE reports SET status='running',lease_until=?,updated_at=?
    WHERE date=? AND status IN ('pending','error','ready','running') AND lease_until<?`)
    .bind(now + 120000, stamp(), key, now).run();
  if (!claim.meta.changes) return { status: 'already-handled-or-running' };
  try {
    const stored = await env.DB.prepare('SELECT body FROM reports WHERE date=?').bind(key).first();
    const report = stored.body ? JSON.parse(stored.body) : await buildReport(env, date, symbols, now, fetcher, slot);
    await env.DB.prepare("UPDATE reports SET body=?,status='ready',error=NULL WHERE date=?").bind(JSON.stringify(report), key).run();
    const status = report.holiday ? 'holiday' : await deliver(env, key, report.chunks, fetcher);
    await env.DB.prepare('UPDATE reports SET status=?,lease_until=0,updated_at=? WHERE date=?')
      .bind(status === 'retry' ? 'ready' : status, stamp(), key).run();
    console.log(JSON.stringify({ event: 'daily-report', date, slot, status }));
    return { status };
  } catch (error) {
    const safe = String(error.message || t(env.MESSAGE_LANGUAGE, 'unknownError')).replaceAll(env.ALPACA_KEY || '\0', '[redacted]').replaceAll(env.ALPACA_SECRET || '\0', '[redacted]');
    await env.DB.prepare("UPDATE reports SET status='error',lease_until=0,error=?,updated_at=? WHERE date=?").bind(safe, stamp(), key).run();
    console.log(JSON.stringify({ event: 'report-failed', date, error: safe }));
    // Last retry gives an actionable failure notification instead of fabricated prices.
    if (nyParts(now).minute === reportSlots[slot].minute + 10) {
      await deliver(env, `${key}-error`, [t(env.MESSAGE_LANGUAGE, 'reportFailed', { date: date, label: t(env.MESSAGE_LANGUAGE, slot), error: safe })], fetcher);
    }
    return { status: 'error', error: safe };
  }
}

export async function handleCommand(env, text, date) {
  const [rawCommand, rawSymbols, rawDays] = text.trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  if (command === '/watch') {
    const symbols = validateSymbols((rawSymbols || '').split(','), env.MESSAGE_LANGUAGE);
    const days = rawDays === undefined ? 7 : Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error(t(env.MESSAGE_LANGUAGE, 'watchDays'));
    // Atomic SQL cap also protects against concurrent webhook updates.
    await env.DB.batch(symbols.map(s => env.DB.prepare(`INSERT INTO watches(symbol,starts_on,expires_on)
      SELECT ?,?,? WHERE (SELECT COUNT(*) FROM watches WHERE expires_on>=?)<15
      OR EXISTS (SELECT 1 FROM watches WHERE symbol=? AND expires_on>=?)
      ON CONFLICT(symbol) DO UPDATE SET starts_on=excluded.starts_on,expires_on=excluded.expires_on`)
      .bind(s, date, addDays(date, days - 1), date, s, date)));
    const actual = await activeSymbols(env, date);
    const skipped = symbols.filter(s => !actual.includes(s));
    return t(env.MESSAGE_LANGUAGE, 'watchUntil', { date: addDays(date, days - 1), symbols: symbols.filter(s => actual.includes(s)).join(', ') }) +
      (skipped.length ? t(env.MESSAGE_LANGUAGE, 'watchSkipped', { symbols: skipped.join(', ') }) : '') + t(env.MESSAGE_LANGUAGE, 'watchSchedule');
  }
  if (command === '/stop') {
    const symbols = validateSymbols((rawSymbols || '').split(','), env.MESSAGE_LANGUAGE);
    await env.DB.batch(symbols.map(s => env.DB.prepare('DELETE FROM watches WHERE symbol=?').bind(s)));
    return t(env.MESSAGE_LANGUAGE, 'stopped', { symbols: symbols.join(', ') });
  }
  if (command === '/list' || command === '/start') {
    const rows = await env.DB.prepare('SELECT symbol, expires_on FROM watches WHERE expires_on>=? ORDER BY symbol').bind(date).all();
    return t(env.MESSAGE_LANGUAGE, 'watchList') + (rows.results.map(r => t(env.MESSAGE_LANGUAGE, 'watchItem', { symbol: r.symbol, date: r.expires_on })).join('\n') || t(env.MESSAGE_LANGUAGE, 'none')) +
      t(env.MESSAGE_LANGUAGE, 'help');
  }
  if (command === '/status') {
    const r = await env.DB.prepare('SELECT date,status,error FROM reports ORDER BY updated_at DESC, date DESC LIMIT 1').first();
    return r ? t(env.MESSAGE_LANGUAGE, 'status', { date: r.date, status: r.status, error: r.error || '' }) : t(env.MESSAGE_LANGUAGE, 'noReports');
  }
  return t(env.MESSAGE_LANGUAGE, 'commands');
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ service: 'opening-stock-watch', alive: true });
  if (url.pathname === '/telegram' && request.method === 'POST') {
    if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) return json({ error: t(env.MESSAGE_LANGUAGE, 'unauthorized') }, 401);
    const update = await request.json();
    const m = update.message;
    if (!m || m.chat?.type !== 'private' || String(m.chat.id) !== env.TELEGRAM_CHAT_ID || String(m.from?.id) !== env.TELEGRAM_CHAT_ID) return json({ ok: true });
    if (!Number.isSafeInteger(update.update_id) || typeof m.text !== 'string') return json({ ok: true });
    const date = nyParts(Date.now()).date;
    await initialize(env, date);
    const claim = await env.DB.prepare('INSERT OR IGNORE INTO updates VALUES (?,?)').bind(update.update_id, stamp()).run();
    if (!claim.meta.changes) return json({ ok: true });
    let reply;
    try { reply = await handleCommand(env, m.text, date); } catch (e) { reply = e.message; }
    await sendTelegram(env, reply);
    return json({ ok: true });
  }
  if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: t(env.MESSAGE_LANGUAGE, 'unauthorized') }, 401);
  if (url.pathname === '/api/status') {
    const rows = await env.DB.prepare('SELECT date,status,error,updated_at FROM reports ORDER BY updated_at DESC, date DESC LIMIT 7').all();
    return json({ reports: rows.results });
  }
  if (url.pathname === '/api/report') {
    const row = await env.DB.prepare('SELECT body FROM reports WHERE date=?').bind(reportKey(url.searchParams.get('date') || nyParts(Date.now()).date, url.searchParams.get('slot') || 'opening', env.MESSAGE_LANGUAGE)).first();
    return row?.body ? new Response(row.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json({ error: t(env.MESSAGE_LANGUAGE, 'notFound') }, 404);
  }
  if (url.pathname === '/api/preview' && request.method === 'POST') {
    const body = await request.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return json({ error: t(env.MESSAGE_LANGUAGE, 'dateFormat') }, 400);
    return json(await buildReport(env, body.date, validateSymbols(body.symbols || ['SPY'], env.MESSAGE_LANGUAGE), Date.now(), fetch, body.slot || 'opening'));
  }
  return json({ error: t(env.MESSAGE_LANGUAGE, 'notFound') }, 404);
}

export default {
  async scheduled(_controller, env) { await runDaily(env, Date.now()); },
  async fetch(request, env) {
    try { return await handleRequest(request, env); }
    catch (e) { return json({ error: e.message || t(env.MESSAGE_LANGUAGE, 'requestFailed') }, e.status || 500); }
  }
};
