import { t, languageOf } from './messages.js';
import { reportSlots, reportKey, addDays, nyInstant, nyParts, validateSymbols, windowStats, inspectBars, analyzeStock, formatReport } from './core.js';

export class DataError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function alpacaClient(env, fetcher = fetch) {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET) throw new DataError(t(env.MESSAGE_LANGUAGE, 'missingAlpaca'), 503);
  const accountHost = env.ALPACA_ACCOUNT_ENV === 'live' ? 'https://api.alpaca.markets' : 'https://paper-api.alpaca.markets';
  let calls = 0;
  async function get(host, path, params) {
    if (++calls > 30) throw new DataError(t(env.MESSAGE_LANGUAGE, 'requestBudget'));
    const url = new URL(path, host);
    for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
    let response;
    try {
      response = await fetcher(url.toString(), {
        headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET },
        signal: AbortSignal.timeout(15000)
      });
    } catch { throw new DataError(t(env.MESSAGE_LANGUAGE, 'alpacaNetwork')); }
    if (!response.ok) {
      const explanation = response.status === 403 ? t(env.MESSAGE_LANGUAGE, 'alpacaForbidden')
        : response.status === 401 ? t(env.MESSAGE_LANGUAGE, 'alpacaUnauthorized')
        : response.status === 429 ? t(env.MESSAGE_LANGUAGE, 'alpacaRateLimit') : t(env.MESSAGE_LANGUAGE, 'alpacaFailed');
      throw new DataError(`${explanation} HTTP ${response.status}`);
    }
    try { return await response.json(); } catch { throw new DataError(t(env.MESSAGE_LANGUAGE, 'alpacaJson')); }
  }
  return {
    async calendar(start, end) {
      const result = await get(accountHost, '/v2/calendar', { start, end });
      if (!Array.isArray(result)) throw new DataError(t(env.MESSAGE_LANGUAGE, 'calendarFormat'));
      return result.sort((a, b) => a.date.localeCompare(b.date));
    },
    async bars(symbols, start, end, now = Date.now()) {
      if (end > now - 16 * 60000) throw new DataError(t(env.MESSAGE_LANGUAGE, 'dataDelay'), 409);
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
          throw new DataError(t(env.MESSAGE_LANGUAGE, 'barsFormat'));
        }
        for (const s of symbols) {
          const rows = result.bars?.[s] ?? [];
          if (!Array.isArray(rows)) throw new DataError(t(env.MESSAGE_LANGUAGE, 'barsList'));
          all[s].push(...rows);
        }
        token = result.next_page_token || null;
        if (token && seen.has(token)) throw new DataError(t(env.MESSAGE_LANGUAGE, 'paginationLoop'));
        seen.add(token);
      } while (token);
      return all;
    }
  };
}

export async function buildReport(env, date, symbols, now = Date.now(), fetcher = fetch, slot = 'opening') {
  const language = languageOf(env.MESSAGE_LANGUAGE);
  reportKey(date, slot, language);
  validateSymbols(symbols, language);
  const volumeOptions = {
    minShares: Number(env.LARGE_MINUTE_SHARES ?? 10_000_000),
    multiple: Number(env.UNUSUAL_VOLUME_MULTIPLE ?? 5)
  };
  if (!Number.isFinite(volumeOptions.minShares) || volumeOptions.minShares <= 0 ||
      !Number.isFinite(volumeOptions.multiple) || volumeOptions.multiple <= 1) {
    throw new DataError(t(language, 'invalidVolumeThreshold'), 400);
  }
  const client = alpacaClient(env, fetcher);
  const calendar = await client.calendar(addDays(date, -20), date);
  const session = calendar.find(s => s.date === date);
  if (!session) return { date, holiday: true, stocks: [], chunks: [] };
  // US listed stocks/ETFs only. Unexpected exchange opening hours must be reviewed.
  if (session.open !== '09:30') throw new DataError(t(env.MESSAGE_LANGUAGE, 'unsupportedOpen', { open: session.open }));
  const start = nyInstant(date, session.open);
  const end = Math.min(nyInstant(date, reportSlots[slot].end), nyInstant(date, session.close));
  const duration = end - start;
  const current = await client.bars(symbols, start, end, now);
  const previousSessions = calendar.filter(s => s.date < date).slice(-5).reverse();
  const historical = [];
  // Compare equal-duration regular-session windows; short historical sessions remain incomplete.
  for (const day of previousSessions) {
    const from = nyInstant(day.date, day.open);
    historical.push({ date: day.date, start: from, end: from + duration,
      bars: await client.bars(symbols, from, Math.min(from + duration, nyInstant(day.date, day.close)), now) });
  }
  const priorDay = previousSessions[0];
  const closeEnd = priorDay ? nyInstant(priorDay.date, priorDay.close) : null;
  const closeBars = priorDay ? await client.bars(symbols, closeEnd - 60000, closeEnd, now) : {};
  const stocks = symbols.map(symbol => {
    const today = windowStats(current[symbol], start, end, language);
    const prior = historical.map(h => ({ date: h.date, stats: windowStats(h.bars[symbol], h.start, h.end, language) }));
    const close = priorDay ? inspectBars(closeBars[symbol], closeEnd - 60000, closeEnd, language) : null;
    return analyzeStock(symbol, today, prior, close?.complete
      ? { price: close.bars[0].c, barTime: close.bars[0].t, date: priorDay.date } : null, volumeOptions);
  });
  const report = { version: 1, date, slot, language, holiday: false, source: 'alpaca', feed: 'sip', adjustment: 'split',
    gatheredAt: new Date(now).toISOString(), windowStart: new Date(start).toISOString(),
    windowEndExclusive: new Date(end).toISOString(), stocks };
  report.chunks = formatReport(report);
  return report;
}
