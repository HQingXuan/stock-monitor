import { addDays, nyInstant, nyParts, validateSymbols, windowStats, inspectBars, analyzeStock, formatReport } from './core.js';

export class DataError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function alpacaClient(env, fetcher = fetch) {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET) throw new DataError('尚未配置 Alpaca API key/secret。', 503);
  const accountHost = env.ALPACA_ACCOUNT_ENV === 'live' ? 'https://api.alpaca.markets' : 'https://paper-api.alpaca.markets';
  let calls = 0;
  async function get(host, path, params) {
    if (++calls > 30) throw new DataError('超过单次报告请求预算；未把截断结果当作完整数据。');
    const url = new URL(path, host);
    for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
    let response;
    try {
      response = await fetcher(url.toString(), {
        headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET },
        signal: AbortSignal.timeout(15000)
      });
    } catch { throw new DataError('Alpaca 网络请求失败或超时。'); }
    if (!response.ok) {
      const explanation = response.status === 403 ? 'SIP/账户权限不足。请检查 key 和延迟范围；不会降级到 IEX。'
        : response.status === 401 ? 'Alpaca key 无效或账户环境不匹配。'
        : response.status === 429 ? 'Alpaca 限流；稍后重试。' : 'Alpaca 请求失败。';
      throw new DataError(`${explanation} HTTP ${response.status}`);
    }
    try { return await response.json(); } catch { throw new DataError('Alpaca 返回了非 JSON 响应。'); }
  }
  return {
    async calendar(start, end) {
      const result = await get(accountHost, '/v2/calendar', { start, end });
      if (!Array.isArray(result)) throw new DataError('交易日历格式异常。');
      return result.sort((a, b) => a.date.localeCompare(b.date));
    },
    async bars(symbols, start, end, now = Date.now()) {
      if (end > now - 16 * 60000) throw new DataError('请求窗口尚未满足15分钟延迟及1分钟缓冲。', 409);
      const all = Object.fromEntries(symbols.map(s => [s, []]));
      let token = null;
      const seen = new Set();
      do {
        const result = await get('https://data.alpaca.markets', '/v2/stocks/bars', {
          symbols: symbols.join(','), timeframe: '1Min', feed: 'sip', adjustment: 'split',
          start: new Date(start).toISOString(), end: new Date(end - 1).toISOString(),
          asof: nyParts(now).date, sort: 'asc', limit: '10000', page_token: token
        });
        if (result.bars !== null && (typeof result.bars !== 'object' || Array.isArray(result.bars))) {
          throw new DataError('分钟行情格式异常。');
        }
        for (const s of symbols) {
          const rows = result.bars?.[s] ?? [];
          if (!Array.isArray(rows)) throw new DataError('分钟行情列表格式异常。');
          all[s].push(...rows);
        }
        token = result.next_page_token || null;
        if (token && seen.has(token)) throw new DataError('行情分页循环，无法确认数据完整性。');
        seen.add(token);
      } while (token);
      return all;
    }
  };
}

export async function buildReport(env, date, symbols, now = Date.now(), fetcher = fetch) {
  validateSymbols(symbols);
  const client = alpacaClient(env, fetcher);
  const calendar = await client.calendar(addDays(date, -20), date);
  const session = calendar.find(s => s.date === date);
  if (!session) return { date, holiday: true, stocks: [], chunks: [] };
  // US listed stocks/ETFs only. Unexpected exchange opening hours must be reviewed.
  if (session.open !== '09:30') throw new DataError(`未支持的开盘时间 ${session.open}，停止常规日报。`);
  const start = nyInstant(date, session.open), end = start + 30 * 60000;
  const current = await client.bars(symbols, start, end, now);
  const previousSessions = calendar.filter(s => s.date < date).slice(-5).reverse();
  const historical = [];
  // Bounded, small windows avoid downloading entire days or exceeding Free plan subrequest limits.
  for (const day of previousSessions) {
    const from = nyInstant(day.date, day.open);
    historical.push({ date: day.date, start: from, end: from + 30 * 60000,
      bars: await client.bars(symbols, from, from + 30 * 60000, now) });
  }
  const priorDay = previousSessions[0];
  const closeEnd = priorDay ? nyInstant(priorDay.date, priorDay.close) : null;
  const closeBars = priorDay ? await client.bars(symbols, closeEnd - 60000, closeEnd, now) : {};
  const stocks = symbols.map(symbol => {
    const today = windowStats(current[symbol], start, end);
    const prior = historical.map(h => ({ date: h.date, stats: windowStats(h.bars[symbol], h.start, h.end) }));
    const close = priorDay ? inspectBars(closeBars[symbol], closeEnd - 60000, closeEnd) : null;
    return analyzeStock(symbol, today, prior, close?.complete
      ? { price: close.bars[0].c, barTime: close.bars[0].t, date: priorDay.date } : null);
  });
  const report = { version: 1, date, holiday: false, source: 'alpaca', feed: 'sip', adjustment: 'split',
    gatheredAt: new Date(now).toISOString(), windowStart: new Date(start).toISOString(),
    windowEndExclusive: new Date(end).toISOString(), stocks };
  report.chunks = formatReport(report);
  return report;
}
