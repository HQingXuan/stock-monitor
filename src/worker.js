import { addDays, nyParts, scheduledWindow, validateSymbols } from './core.js';
import { buildReport } from './alpaca.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const stamp = () => new Date().toISOString();

export async function initialize(env, date) {
  // INSERT OR IGNORE and conditional seed occur atomically in one D1 batch.
  const symbols = validateSymbols((env.INITIAL_SYMBOLS || 'SPY,QQQ,TQQQ,GOOG').split(','));
  const days = Number(env.INITIAL_DAYS || 7);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('INITIAL_DAYS 必须为1–365。');
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
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('Telegram 尚未配置。');
  // Never log request URLs: Telegram embeds credentials in the URL.
  const response = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(15000)
  });
  let body;
  try { body = await response.json(); } catch { throw new Error('Telegram 发送结果未知。'); }
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
  if (!scheduledWindow(now)) return { status: 'outside-window' };
  const { date } = nyParts(now);
  await initialize(env, date);
  const symbols = await activeSymbols(env, date);
  if (!symbols.length) return { status: 'no-active-watches' };
  await env.DB.prepare("INSERT OR IGNORE INTO reports (date,status,updated_at) VALUES (?,'pending',?)").bind(date, stamp()).run();
  const claim = await env.DB.prepare(`UPDATE reports SET status='running',lease_until=?,updated_at=?
    WHERE date=? AND status IN ('pending','error','ready','running') AND lease_until<?`)
    .bind(now + 120000, stamp(), date, now).run();
  if (!claim.meta.changes) return { status: 'already-handled-or-running' };
  try {
    const stored = await env.DB.prepare('SELECT body FROM reports WHERE date=?').bind(date).first();
    const report = stored.body ? JSON.parse(stored.body) : await buildReport(env, date, symbols, now, fetcher);
    await env.DB.prepare("UPDATE reports SET body=?,status='ready',error=NULL WHERE date=?").bind(JSON.stringify(report), date).run();
    const status = report.holiday ? 'holiday' : await deliver(env, date, report.chunks, fetcher);
    await env.DB.prepare('UPDATE reports SET status=?,lease_until=0,updated_at=? WHERE date=?')
      .bind(status === 'retry' ? 'ready' : status, stamp(), date).run();
    console.log(JSON.stringify({ event: 'daily-report', date, status }));
    return { status };
  } catch (error) {
    const safe = String(error.message || '未知错误').replaceAll(env.ALPACA_KEY || '\0', '[redacted]').replaceAll(env.ALPACA_SECRET || '\0', '[redacted]');
    await env.DB.prepare("UPDATE reports SET status='error',lease_until=0,error=?,updated_at=? WHERE date=?").bind(safe, stamp(), date).run();
    console.log(JSON.stringify({ event: 'report-failed', date, error: safe }));
    // Last retry gives an actionable failure notification instead of fabricated prices.
    if (nyParts(now).minute === 26) {
      await deliver(env, `${date}-error`, [`⚠ ${date} 股票日报生成失败。\n${safe}\n请检查云端 /api/status；今天没有可靠的价格/成交量结论。`], fetcher);
    }
    return { status: 'error', error: safe };
  }
}

export async function handleCommand(env, text, date) {
  const [rawCommand, rawSymbols, rawDays] = text.trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  if (command === '/watch') {
    const symbols = validateSymbols((rawSymbols || '').split(','));
    const days = rawDays === undefined ? 7 : Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('监控天数必须为1–365个自然日。');
    // Atomic SQL cap also protects against concurrent webhook updates.
    await env.DB.batch(symbols.map(s => env.DB.prepare(`INSERT INTO watches(symbol,starts_on,expires_on)
      SELECT ?,?,? WHERE (SELECT COUNT(*) FROM watches WHERE expires_on>=?)<15
      OR EXISTS (SELECT 1 FROM watches WHERE symbol=? AND expires_on>=?)
      ON CONFLICT(symbol) DO UPDATE SET starts_on=excluded.starts_on,expires_on=excluded.expires_on`)
      .bind(s, date, addDays(date, days - 1), date, s, date)));
    const actual = await activeSymbols(env, date);
    const skipped = symbols.filter(s => !actual.includes(s));
    return `监控至 ${addDays(date, days - 1)}（含当天）：${symbols.filter(s => actual.includes(s)).join(', ')}` +
      (skipped.length ? `\n已达到15只上限，未添加：${skipped.join(', ')}` : '') + '\n每个交易日10:16 ET；当天已发送的日报不重复发送。';
  }
  if (command === '/stop') {
    const symbols = validateSymbols((rawSymbols || '').split(','));
    await env.DB.batch(symbols.map(s => env.DB.prepare('DELETE FROM watches WHERE symbol=?').bind(s)));
    return `已停止：${symbols.join(', ')}`;
  }
  if (command === '/list' || command === '/start') {
    const rows = await env.DB.prepare('SELECT symbol, expires_on FROM watches WHERE expires_on>=? ORDER BY symbol').bind(date).all();
    return '📋 当前监控\n' + (rows.results.map(r => `${r.symbol} · 截至 ${r.expires_on}`).join('\n') || '无') +
      '\n\n/watch SPY,QQQ 7\n/stop SPY\n/list\n/status\n支持美股/ETF，最多15只。天数为自然日，休市不发。';
  }
  if (command === '/status') {
    const r = await env.DB.prepare('SELECT date,status,error FROM reports ORDER BY date DESC LIMIT 1').first();
    return r ? `最近日报：${r.date}\n状态：${r.status}\n${r.error || ''}` : '尚未生成日报。';
  }
  return '命令：/watch SPY,QQQ 7 · /stop SPY · /list · /status';
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ service: 'opening-stock-watch', alive: true });
  if (url.pathname === '/telegram' && request.method === 'POST') {
    if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401);
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
  if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'unauthorized' }, 401);
  if (url.pathname === '/api/status') {
    const rows = await env.DB.prepare('SELECT date,status,error,updated_at FROM reports ORDER BY date DESC LIMIT 7').all();
    return json({ reports: rows.results });
  }
  if (url.pathname === '/api/report') {
    const row = await env.DB.prepare('SELECT body FROM reports WHERE date=?').bind(url.searchParams.get('date') || nyParts(Date.now()).date).first();
    return row?.body ? new Response(row.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json({ error: 'not found' }, 404);
  }
  if (url.pathname === '/api/preview' && request.method === 'POST') {
    const body = await request.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return json({ error: 'date needs YYYY-MM-DD' }, 400);
    return json(await buildReport(env, body.date, validateSymbols(body.symbols || ['SPY'])));
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async scheduled(_controller, env) { await runDaily(env, Date.now()); },
  async fetch(request, env) {
    try { return await handleRequest(request, env); }
    catch (e) { return json({ error: e.message || 'request failed' }, e.status || 500); }
  }
};
