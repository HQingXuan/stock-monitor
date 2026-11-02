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

export function scheduledWindow(now) {
  const p = nyParts(now);
  return p.hour === 10 && p.minute >= 16 && p.minute <= 26;
}

export function validateSymbols(value) {
  const symbols = [...new Set(value.map(x => String(x).trim().toUpperCase()))];
  if (!symbols.length || symbols.length > 15 || symbols.some(x => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(x))) {
    throw new Error('股票列表必须包含 1–15 个有效代码，例如 SPY、QQQ、TQQQ、GOOG。');
  }
  return symbols;
}

export function percent(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) && previous > 0
    ? (current / previous - 1) * 100 : null;
}

export function inspectBars(input, start, end) {
  const seen = new Set();
  const bars = [];
  const issues = [];
  for (const raw of input || []) {
    const t = Date.parse(raw.t);
    if (t < start || t >= end) continue;
    if (!Number.isFinite(t) || (t - start) % 60000 !== 0 ||
        !['o', 'h', 'l', 'c', 'v'].every(k => typeof raw[k] === 'number' && Number.isFinite(raw[k])) ||
        raw.o <= 0 || raw.c <= 0 || raw.l <= 0 || raw.v < 0 ||
        raw.h < Math.max(raw.o, raw.c, raw.l) || raw.l > Math.min(raw.o, raw.c)) {
      issues.push('存在无效分钟数据');
      continue;
    }
    if (seen.has(t)) { issues.push('存在重复分钟数据'); continue; }
    seen.add(t);
    bars.push({ ...raw, t: new Date(t).toISOString() });
  }
  bars.sort((a, b) => a.t.localeCompare(b.t));
  const expected = (end - start) / 60000;
  if (bars.length !== expected) issues.push(`分钟覆盖 ${bars.length}/${expected}，缺失不能当作零成交`);
  return { bars, complete: issues.length === 0, issues: [...new Set(issues)], expected };
}

export function windowStats(input, start, end) {
  const check = inspectBars(input, start, end);
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

export function analyzeStock(symbol, current, prior, previousClose) {
  const good = prior.filter(p => p.stats.complete);
  const mean = good.length >= 3 ? good.reduce((s, p) => s + p.stats.volume, 0) / good.length : null;
  const previous = prior[0]?.stats.complete ? prior[0].stats.volume : null;
  return {
    symbol, current, previousClose,
    changeFromPreviousClose: percent(current.price, previousClose?.price),
    volumeVsPrevious: percent(current.volume, previous),
    volumeRatio: current.volume !== null && mean > 0 ? current.volume / mean : null,
    baselineCount: good.length, baselineRequested: prior.length,
    history: [...prior].reverse().map(p => ({ date: p.date, price: p.stats.price, volume: p.stats.volume, complete: p.stats.complete }))
  };
}

export function sparkline(values) {
  if (!values.length || values.some(x => !Number.isFinite(x))) return '数据不足';
  const glyphs = '▁▂▃▄▅▆▇█';
  const min = Math.min(...values), max = Math.max(...values);
  return values.map(x => glyphs[max === min ? 3 : Math.round((x - min) / (max - min) * 7)]).join('');
}

const pct = x => x === null ? '数据不足' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
const vol = x => x === null ? '数据不足' : x >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : `${(x / 1000).toFixed(1)}K`;

export function formatReport(report) {
  const header = `📊 股票开盘日报 · ${report.date}\n窗口：09:30–10:00 ET\n数据：Alpaca SIP 全市场 · 延迟至少15分钟\n价格口径：分钟成交K线；拆股调整\n`;
  const blocks = report.stocks.map(s => {
    if (!s.current.complete) return `\n${s.symbol}\n⚠ 数据不完整，本次不计算涨跌和成交量结论\n${s.current.issues.join('；')}\n`;
    const c = s.current;
    return `\n${s.symbol} · $${c.price.toFixed(2)}\n较昨收前1分钟参考：${pct(s.changeFromPreviousClose)}\n开盘半小时变化：${pct(c.openingChange)}\n成交量：${vol(c.volume)} · 较昨日同期 ${pct(s.volumeVsPrevious)}\n近${s.baselineCount}/${s.baselineRequested}日同期均量：${s.volumeRatio === null ? '样本不足' : `${s.volumeRatio.toFixed(2)}×`}\n每5分钟价格 ${sparkline(c.buckets.map(x => x.close))}\n每5分钟成交量 ${sparkline(c.buckets.map(x => x.volume))}\n分段量：${c.buckets.map(x => vol(x.volume)).join(' / ')}\n历史同窗口价 ${sparkline(s.history.filter(x => x.complete).map(x => x.price))}\n历史同窗口量 ${sparkline(s.history.filter(x => x.complete).map(x => x.volume))}\n`;
  });
  const chunks = [];
  let text = header;
  for (const block of blocks) {
    if (text.length + block.length > 3400) { chunks.push(text); text = header + '（续）\n'; }
    text += block;
  }
  text += '\n09:59分钟K线覆盖至10:00；不代表发送时现价。\n迷你图各自缩放；成交量不表示买盘/卖盘方向。';
  chunks.push(text);
  return chunks;
}
