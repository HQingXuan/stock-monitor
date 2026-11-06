import { t, languageOf } from './messages.js';
const nyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function nyParts(value) {
  const p = Object.fromEntries(nyFormatter.formatToParts(new Date(value)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

// Market opens/closes do not fall in the ambiguous DST transition hour.
export function nyInstant(date, clock) {
  const [hour, minute] = clock.split(':').map(Number);
  const utcNoon = Date.parse(`${date}T12:00:00Z`);
  const localNoon = nyParts(utcNoon);
  const offset = localNoon.hour - 12;
  return Date.parse(`${date}T00:00:00Z`) + (hour - offset) * 3600000 + minute * 60000;
}

export const reportSlots = {
  opening: { hour: 10, minute: 16, end: '10:00' },
  noon: { hour: 12, minute: 0, end: '11:44' },
  afternoon: { hour: 15, minute: 30, end: '15:14' }
};

export function scheduledSlot(now) {
  const p = nyParts(now);
  return Object.keys(reportSlots).find(key => {
    const slot = reportSlots[key];
    return p.hour === slot.hour && p.minute >= slot.minute && p.minute <= slot.minute + 10;
  }) || null;
}

export function scheduledWindow(now) {
  return scheduledSlot(now) !== null;
}

export function reportKey(date, slot = 'opening', language = 'zh') {
  if (!Object.hasOwn(reportSlots, slot)) throw new Error(t(language, 'unknownSlot'));
  return slot === 'opening' ? date : `${date}-${slot}`;
}

export function validateSymbols(value, language = 'zh') {
  const symbols = [...new Set(value.map(x => String(x).trim().toUpperCase()))];
  if (!symbols.length || symbols.length > 15 || symbols.some(x => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(x))) {
    throw new Error(t(language, 'invalidSymbols'));
  }
  return symbols;
}

export function percent(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) && previous > 0
    ? (current / previous - 1) * 100 : null;
}

export function inspectBars(input, start, end, language = 'zh') {
  const seen = new Set();
  const bars = [];
  const issues = [];
  for (const raw of input || []) {
    const timestamp = Date.parse(raw.t);
    if (timestamp < start || timestamp >= end) continue;
    if (!Number.isFinite(timestamp) || (timestamp - start) % 60000 !== 0 ||
        !['o', 'h', 'l', 'c', 'v'].every(k => typeof raw[k] === 'number' && Number.isFinite(raw[k])) ||
        raw.o <= 0 || raw.c <= 0 || raw.l <= 0 || raw.v < 0 ||
        raw.h < Math.max(raw.o, raw.c, raw.l) || raw.l > Math.min(raw.o, raw.c)) {
      issues.push(t(language, 'invalidBars'));
      continue;
    }
    if (seen.has(timestamp)) { issues.push(t(language, 'duplicateBars')); continue; }
    seen.add(timestamp);
    bars.push({ ...raw, t: new Date(timestamp).toISOString() });
  }
  bars.sort((a, b) => a.t.localeCompare(b.t));
  const expected = (end - start) / 60000;
  if (bars.length !== expected) issues.push(t(language, 'coverage', { actual: bars.length, expected: expected }));
  return { bars, complete: issues.length === 0, issues: [...new Set(issues)], expected };
}

export function windowStats(input, start, end, language = 'zh') {
  const check = inspectBars(input, start, end, language);
  if (!check.complete) return { ...check, volume: null, price: null, buckets: [] };
  const b = check.bars;
  const buckets = [];
  for (let i = 0; i < b.length; i += 5) {
    const group = b.slice(i, i + 5);
    buckets.push({ time: group[0].t, close: group.at(-1).c, volume: group.reduce((s, x) => s + x.v, 0) });
  }
  return { ...check, price: b.at(-1).c, open: b[0].o,
    volume: b.reduce((s, x) => s + x.v, 0),
    high: Math.max(...b.map(x => x.h)), low: Math.min(...b.map(x => x.l)),
    openingChange: percent(b.at(-1).c, b[0].o), buckets };
}

// Minute aggregates describe trading activity, not individual trades or investor identity.
export function analyzeVolumeEvents(current, prior, { minShares = 10_000_000, multiple = 5 } = {}) {
  const result = { minShares, multiple, largeCount: 0, unusualCount: 0, eventCount: 0,
    baselineMissing: 0, complete: current.complete, events: [] };
  if (!current.complete) return result;
  const minuteKey = value => { const p = nyParts(value); return p.hour * 60 + p.minute; };
  // Use only complete historical windows; absent bars are never zero volume.
  const history = prior.filter(p => p.stats.complete).map(p => {
    const bars = p.stats.bars || [];
    const start = bars.length ? minuteKey(bars[0].t) : 0;
    return new Map(bars.map((b, i) => [start + i, b.v]));
  });
  const startMinute = current.bars?.length ? minuteKey(current.bars[0].t) : 0;
  for (const [index, bar] of (current.bars || []).entries()) {
    const samples = history.map(day => day.get(startMinute + index)).filter(Number.isFinite).sort((a,b) => a-b);
    const middle = Math.floor(samples.length / 2);
    const median = samples.length >= 3 ? (samples.length % 2 ? samples[middle] : (samples[middle-1]+samples[middle])/2) : null;
    const ratio = median > 0 ? bar.v / median : null;
    if (ratio === null) result.baselineMissing++;
    const large = bar.v >= minShares, unusual = ratio !== null && ratio >= multiple;
    if (large) result.largeCount++;
    if (unusual) result.unusualCount++;
    if (!large && !unusual) continue;
    const notional = Number.isFinite(bar.vw) && bar.vw > 0 ? bar.v * bar.vw : null;
    result.events.push({ time: bar.t, shares: bar.v, estimatedNotional: Number.isFinite(notional) ? notional : null,
      change: percent(bar.c, bar.o), ratio, baselineCount: samples.length, large, unusual });
  }
  result.eventCount = result.events.length;
  // Bound message size while reporting the total hit count; display the largest minutes first.
  result.events.sort((a,b) => b.shares-a.shares || a.time.localeCompare(b.time));
  result.events = result.events.slice(0,3);
  return result;
}

export function analyzeStock(symbol, current, prior, previousClose, volumeOptions) {
  const good = prior.filter(p => p.stats.complete);
  const mean = good.length >= 3 ? good.reduce((s, p) => s + p.stats.volume, 0) / good.length : null;
  const previous = prior[0]?.stats.complete ? prior[0].stats.volume : null;
  return {
    symbol, current, previousClose,
    volumeEvents: analyzeVolumeEvents(current, prior, volumeOptions),
    changeFromPreviousClose: percent(current.price, previousClose?.price),
    volumeVsPrevious: percent(current.volume, previous),
    volumeRatio: current.volume !== null && mean > 0 ? current.volume / mean : null,
    baselineCount: good.length, baselineRequested: prior.length,
    history: [...prior].reverse().map(p => ({ date: p.date, price: p.stats.price, volume: p.stats.volume, complete: p.stats.complete }))
  };
}

export function sparkline(values, language = 'zh') {
  if (!values.length || values.some(x => !Number.isFinite(x))) return t(language, 'insufficient');
  const glyphs = '▁▂▃▄▅▆▇█';
  const min = Math.min(...values), max = Math.max(...values);
  return values.map(x => glyphs[max === min ? 3 : Math.round((x - min) / (max - min) * 7)]).join('');
}

export function formatReport(report) {
  const language = languageOf(report.language);
  const msg = (key, params) => t(language, key, params);
  const pct = x => x === null ? msg('insufficient') : `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
  const vol = x => x === null ? msg('insufficient') : x >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : `${(x / 1000).toFixed(1)}K`;
  const plot = values => sparkline(values, language);
  const slot = report.slot || 'opening';
  const end = report.windowEndExclusive ? nyParts(report.windowEndExclusive) : { hour: 10, minute: 0 };
  const endClock = `${String(end.hour).padStart(2, '0')}:${String(end.minute).padStart(2, '0')}`;
  const intraday = slot !== 'opening';
  const shares = x => x.toLocaleString('en-US');
  const eventText = activity => {
    if (!activity) return msg('eventsUnavailable');
    const lines = [msg('eventsSummary', { shares: shares(activity.minShares), large: activity.largeCount, multiple: activity.multiple, unusual: activity.unusualCount })];
    for (const event of activity.events) {
      const p = nyParts(event.time);
      lines.push(msg('eventRow', { time: `${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`,
        shares: shares(event.shares), amount: event.estimatedNotional === null ? msg('insufficient') : `≈$${(event.estimatedNotional/1e6).toFixed(2)}M`,
        ratio: event.ratio === null ? msg('samples') : `${event.ratio.toFixed(2)}× (${event.baselineCount}/5)`, change: pct(event.change),
        reason: msg(event.large && event.unusual ? 'eventBoth' : event.large ? 'eventLarge' : 'eventUnusual') }));
    }
    if (activity.eventCount > activity.events.length) lines.push(msg('eventsTruncated', { total: activity.eventCount, shown: activity.events.length }));
    if (activity.baselineMissing) lines.push(msg('eventsBaselineMissing', { count: activity.baselineMissing }));
    return lines.join('\n');
  };
  const header = msg('reportHeader', { label: msg(slot), date: report.date, end: endClock });
  const blocks = report.stocks.map(s => {
    if (!s.current.complete) return msg('incomplete', { symbol: s.symbol, issues: s.current.issues.join('; ') });
    const c = s.current;
    return msg('stockBlock', {
      symbol: s.symbol, price: c.price.toFixed(2), previousChange: pct(s.changeFromPreviousClose),
      changeLabel: msg(intraday ? 'intradayChange' : 'openingChange'), change: pct(c.openingChange),
      volume: vol(c.volume), volumeChange: pct(s.volumeVsPrevious), count: s.baselineCount, requested: s.baselineRequested,
      ratio: s.volumeRatio === null ? msg('samples') : `${s.volumeRatio.toFixed(2)}×`,
      range: msg('range', { high: c.high.toFixed(2), low: c.low.toFixed(2) }),
      events: eventText(s.volumeEvents),
      historyPrices: plot(s.history.filter(x => x.complete).map(x => x.price)),
      historyVolumes: plot(s.history.filter(x => x.complete).map(x => x.volume))
    });
  });
  const chunks = [];
  let text = header;
  for (const block of blocks) {
    if (text.length + block.length > 3400) { chunks.push(text); text = header + msg('continued') + '\n'; }
    text += block;
  }
  text += msg('reportFooter', { end: endClock });
  chunks.push(text);
  return chunks;
}
