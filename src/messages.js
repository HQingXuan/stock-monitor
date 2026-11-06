// Project-owned user-facing strings. Provider/CLI diagnostics may retain their original language.
export function languageOf(value) {
  if (value === undefined || value === null || value === '') return 'zh';
  if (value === 'en' || value === 'zh') return value;
  throw new Error('MESSAGE_LANGUAGE must be en or zh / MESSAGE_LANGUAGE 必须为 en 或 zh。');
}

export const messages = {
"invalidVolumeThreshold": {"zh": "LARGE_MINUTE_SHARES 必须大于0；UNUSUAL_VOLUME_MULTIPLE 必须大于1，且都必须是有限数值。", "en": "LARGE_MINUTE_SHARES must be >0 and UNUSUAL_VOLUME_MULTIPLE must be >1; both must be finite numbers."},
"eventsUnavailable": {"zh": "分钟成交异动：此历史报告未计算。", "en": "Minute-volume events: not computed for this saved report."},
"eventsSummary": {"zh": "分钟成交异动：≥{shares}股 {large}次；≥{multiple}×同期中位量 {unusual}次（可重叠）", "en": "Minute-volume events: ≥{shares} shares: {large}; ≥{multiple}× same-minute median: {unusual} (may overlap)"},
"eventRow": {"zh": "• {time} ET｜{shares}股｜估算成交额{amount}｜同期量比{ratio}｜分钟涨跌{change}｜{reason}", "en": "• {time} ET | {shares} shares | estimated turnover {amount} | relative volume {ratio} | minute change {change} | {reason}"},
"eventLarge": {"zh": "达股数门槛", "en": "share threshold"},
"eventUnusual": {"zh": "相对异常放量", "en": "unusual relative volume"},
"eventBoth": {"zh": "股数及相对量均达门槛", "en": "both thresholds"},
"eventsTruncated": {"zh": "共{total}个异动分钟，仅展示成交股数最多的{shown}个。", "en": "{total} event minutes; showing the {shown} largest by share volume."},
"eventsBaselineMissing": {"zh": "{count}个分钟历史基线不足，仍检查股数门槛；相对异动未能判断。", "en": "{count} minutes lack a usable historical baseline; share threshold checked, relative activity unknown."},
  demoNotice: { zh: "演示数据：全部数值为模拟，不代表真实市场行情。", en: "Demo: all values are synthetic and do not represent real market data." },
  "unknownSlot": {
    "zh": "未知报告时段。",
    "en": "Unknown report slot."
  },
  "invalidSymbols": {
    "zh": "股票列表必须包含 1–15 个有效代码，例如 SPY、QQQ、TQQQ、GOOG。",
    "en": "Provide 1–15 valid stock symbols, such as SPY, QQQ, TQQQ or GOOG."
  },
  "invalidBars": {
    "zh": "存在无效分钟数据",
    "en": "Invalid minute bars found"
  },
  "duplicateBars": {
    "zh": "存在重复分钟数据",
    "en": "Duplicate minute bars found"
  },
  "coverage": {
    "zh": "分钟覆盖 {actual}/{expected}，缺失不能当作零成交",
    "en": "Minute coverage {actual}/{expected}; missing bars are not zero volume"
  },
  "missingAlpaca": {
    "zh": "尚未配置 Alpaca API key/secret。",
    "en": "Alpaca API key/secret is not configured."
  },
  "requestBudget": {
    "zh": "超过单次报告请求预算；未把截断结果当作完整数据。",
    "en": "Report request budget exceeded; truncated data is not treated as complete."
  },
  "alpacaNetwork": {
    "zh": "Alpaca 网络请求失败或超时。",
    "en": "Alpaca network request failed or timed out."
  },
  "alpacaForbidden": {
    "zh": "SIP/账户权限不足。请检查 key 和延迟范围；不会降级到 IEX。",
    "en": "Insufficient SIP/account permissions. Check your keys and delayed data window; no fallback to IEX."
  },
  "alpacaUnauthorized": {
    "zh": "Alpaca key 无效或账户环境不匹配。",
    "en": "Invalid Alpaca key or mismatched account environment."
  },
  "alpacaRateLimit": {
    "zh": "Alpaca 限流；稍后重试。",
    "en": "Alpaca rate limit reached; retry later."
  },
  "alpacaFailed": {
    "zh": "Alpaca 请求失败。",
    "en": "Alpaca request failed."
  },
  "alpacaJson": {
    "zh": "Alpaca 返回了非 JSON 响应。",
    "en": "Alpaca returned a non-JSON response."
  },
  "calendarFormat": {
    "zh": "交易日历格式异常。",
    "en": "Invalid trading calendar format."
  },
  "dataDelay": {
    "zh": "请求窗口尚未满足15分钟延迟及1分钟缓冲。",
    "en": "The requested window does not yet meet the 15-minute delay plus 1-minute buffer."
  },
  "barsFormat": {
    "zh": "分钟行情格式异常。",
    "en": "Invalid minute-bar response format."
  },
  "barsList": {
    "zh": "分钟行情列表格式异常。",
    "en": "Invalid minute-bar list format."
  },
  "paginationLoop": {
    "zh": "行情分页循环，无法确认数据完整性。",
    "en": "Market-data pagination loop; completeness cannot be confirmed."
  },
  "unsupportedOpen": {
    "zh": "未支持的开盘时间 {open}，停止常规日报。",
    "en": "Unsupported opening time {open}; report stopped."
  },
  "opening": {
    "zh": "开盘日报",
    "en": "Opening report"
  },
  "noon": {
    "zh": "午间总结",
    "en": "Midday summary"
  },
  "afternoon": {
    "zh": "下午总结",
    "en": "Afternoon summary"
  },
  "insufficient": {
    "zh": "数据不足",
    "en": "Insufficient data"
  },
  "samples": {
    "zh": "样本不足",
    "en": "Insufficient samples"
  },
  "openingChange": {
    "zh": "开盘半小时变化",
    "en": "Opening 30-minute change"
  },
  "intradayChange": {
    "zh": "开盘以来变化",
    "en": "Change since open"
  },
  "continued": {
    "zh": "（续）",
    "en": "(continued)"
  },
  "reportHeader": {
    "zh": "📊 股票{label} · {date}\n窗口：09:30–{end} ET（不含终点）\n数据：Alpaca SIP 全市场 · 延迟至少15分钟\n价格口径：分钟成交K线；拆股调整\n",
    "en": "📊 Stocks · {label} · {date}\nWindow: 09:30–{end} ET (end exclusive)\nSource: Alpaca SIP, consolidated market data · delayed at least 15 minutes\nPrices: minute trade bars; split-adjusted\n"
  },
  "incomplete": {
    "zh": "\n{symbol}\n⚠ 数据不完整，本次不计算涨跌和成交量结论\n{issues}\n",
    "en": "\n{symbol}\n⚠ Incomplete data; price-change and volume conclusions withheld\n{issues}\n"
  },
  "stockBlock": {
    "zh": "\n{symbol} · ${price}\n较昨收前1分钟参考：{previousChange}\n{changeLabel}：{change}\n成交量：{volume} · 较昨日同期 {volumeChange}\n近{count}/{requested}日同期均量：{ratio}\n{range}\n{events}\n历史同窗口价 {historyPrices}\n历史同窗口量 {historyVolumes}\n",
    "en": "\n{symbol} · ${price}\nVs. prior session final-minute close: {previousChange}\n{changeLabel}: {change}\nVolume: {volume} · vs. prior session same window {volumeChange}\nRelative volume vs. {count}/{requested} prior sessions: {ratio}\n{range}\n{events}\nHistorical same-window prices {historyPrices}\nHistorical same-window volumes {historyVolumes}\n"
  },
  "range": {
    "zh": "区间最高/最低：${high} / ${low}",
    "en": "Window high/low: ${high} / ${low}"
  },
  "reportFooter": {
    "zh": "\n分钟K线覆盖至{end} ET；不代表发送时现价。\n成交量是整分钟汇总，不是单笔大单；涨跌不代表主动买卖或机构资金流。",
    "en": "\nMinute bars cover up to {end} ET; prices are not live at delivery.\nVolume aggregates a whole minute, not a single block trade; price changes do not identify trade aggressors or institutional flows."
  },
  "initialDays": {
    "zh": "INITIAL_DAYS 必须为1–365。",
    "en": "INITIAL_DAYS must be between 1 and 365."
  },
  "missingTelegram": {
    "zh": "Telegram 尚未配置。",
    "en": "Telegram is not configured."
  },
  "telegramUncertain": {
    "zh": "Telegram 发送结果未知。",
    "en": "Telegram delivery outcome is unknown."
  },
  "unknownError": {
    "zh": "未知错误",
    "en": "Unknown error"
  },
  "watchDays": {
    "zh": "监控天数必须为1–365个自然日。",
    "en": "Watch duration must be 1–365 calendar days."
  },
  "watchSchedule": {
    "zh": "\n每个交易日10:16、12:00、15:30 ET；已发送的同一时段报告不重复发送。",
    "en": "\nEvery trading day at 10:16, 12:00 and 15:30 ET; each report slot is sent only once."
  },
  "none": {
    "zh": "无",
    "en": "None"
  },
  "noReports": {
    "zh": "尚未生成日报。",
    "en": "No reports generated yet."
  },
  "commands": {
    "zh": "命令：/watch SPY,QQQ 7 · /stop SPY · /list · /status",
    "en": "Commands: /watch SPY,QQQ 7 · /stop SPY · /list · /status"
  },
  "watchList": {
    "zh": "📋 当前监控\n",
    "en": "📋 Watchlist\n"
  },
  "help": {
    "zh": "\n\n/watch SPY,QQQ 7\n/stop SPY\n/list\n/status\n支持美股/ETF，最多15只。天数为自然日，休市不发。",
    "en": "\n\n/watch SPY,QQQ 7\n/stop SPY\n/list\n/status\nUS stocks/ETFs, up to 15 symbols. Duration is in calendar days. No reports on market holidays."
  },
  "watchUntil": {
    "zh": "监控至 {date}（含当天）：{symbols}",
    "en": "Watching through {date} (inclusive): {symbols}"
  },
  "watchSkipped": {
    "zh": "\n已达到15只上限，未添加：{symbols}",
    "en": "\n15-symbol limit reached; not added: {symbols}"
  },
  "stopped": {
    "zh": "已停止：{symbols}",
    "en": "Stopped: {symbols}"
  },
  "watchItem": {
    "zh": "{symbol} · 截至 {date}",
    "en": "{symbol} · until {date}"
  },
  "status": {
    "zh": "最近日报：{date}\n状态：{status}\n{error}",
    "en": "Latest report: {date}\nStatus: {status}\n{error}"
  },
  "reportFailed": {
    "zh": "⚠ {date} {label}生成失败。\n{error}\n请检查云端 /api/status；本时段没有可靠的价格/成交量结论。",
    "en": "⚠ {date} {label} failed.\n{error}\nCheck /api/status; no reliable price/volume conclusions for this slot."
  },
  "unauthorized": {
    "zh": "未授权。",
    "en": "Unauthorized."
  },
  "notFound": {
    "zh": "未找到。",
    "en": "Not found."
  },
  "dateFormat": {
    "zh": "日期需要使用 YYYY-MM-DD 格式。",
    "en": "Date must use YYYY-MM-DD."
  },
  "requestFailed": {
    "zh": "请求失败。",
    "en": "Request failed."
  },
  "missingSecret": {
    "zh": "缺少 {key}。先运行账户向导。",
    "en": "Missing {key}. Run the setup wizard first."
  },
  "wranglerStart": {
    "zh": "无法启动Wrangler。",
    "en": "Could not start Wrangler."
  },
  "installTools": {
    "zh": "先运行 npm install 或 pnpm install 安装部署工具。",
    "en": "Run npm install or pnpm install to install deployment tools first."
  },
  "cloudLogin": {
    "zh": "登录Cloudflare。仅选择个人账户及Free方案。",
    "en": "Log in to Cloudflare. Select your personal account and Free plan."
  },
  "databaseMissing": {
    "zh": "未找到新数据库的UUID。",
    "en": "Could not find the database UUID."
  },
  "deployed": {
    "zh": "✓ Worker、D1和加密Secrets已部署。复制上方 https://…workers.dev 地址返回向导。",
    "en": "✓ Worker, D1 and encrypted secrets deployed. Copy the https://…workers.dev URL above and return to the wizard."
  },
  "wranglerFailed": {
    "zh": "Wrangler {command} 失败（{code}）。",
    "en": "Wrangler {command} failed ({code})."
  },
  "noHistory": {
    "zh": "没有可供验证的历史交易日。",
    "en": "No historical trading session available for validation."
  },
  "incompleteSpy": {
    "zh": "SIP请求成功，但SPY开盘半小时分钟数据不完整。",
    "en": "SIP request succeeded, but SPY opening-window minute bars are incomplete."
  },
  "noRecent": {
    "zh": "没有最近交易日。",
    "en": "No recent trading session found."
  },
  "cloudIncomplete": {
    "zh": "云端返回数据不完整。",
    "en": "Cloud response contains incomplete data."
  },
  "cloudCaveat": {
    "zh": "这证明当前云端请求可用；首个交易日仍需检查定时发送和Cloudflare CPU用量。",
    "en": "The cloud request works now; verify scheduled delivery and Cloudflare CPU usage on the next trading day."
  },
  "telegramNetwork": {
    "zh": "Telegram网络请求失败。",
    "en": "Telegram network request failed."
  },
  "missingBot": {
    "zh": "缺少TELEGRAM_BOT_TOKEN",
    "en": "Missing TELEGRAM_BOT_TOKEN."
  },
  "existingWebhook": {
    "zh": "此bot已配置webhook。重跑向导时保留已存的CHAT_ID；不要改变其他bot的webhook。",
    "en": "This bot already has a webhook. Keep the saved CHAT_ID when rerunning setup; do not change another bot’s webhook."
  },
  "noChat": {
    "zh": "未找到私聊。请给刚创建的bot发送 /start 后重试。",
    "en": "No private chat found. Send /start to your new bot, then retry."
  },
  "chatIds": {
    "zh": "私聊ID（选择你自己的）：",
    "en": "Private chat IDs (choose your own): "
  },
  "workerUrl": {
    "zh": "需要完整Worker地址：https://Worker名称.账户子域名.workers.dev；只有账户子域名.workers.dev不能连接bot。请复制Wrangler部署输出的完整地址。",
    "en": "Use the full Worker URL: https://worker-name.account-subdomain.workers.dev. The account subdomain alone is not a bot URL. Copy the full URL from Wrangler."
  },
  "webhookDone": {
    "zh": "✓ 私聊命令webhook已配置。",
    "en": "✓ Private-chat command webhook configured."
  },
  "invalidChat": {
    "zh": "缺少有效私聊ID",
    "en": "Missing a valid private chat ID."
  },
  "testMessage": {
    "zh": "✅ 股票监控bot已连接。这是一条测试消息，不包含真实行情。每个交易日10:16、12:00、15:30 ET发送报告。发送 /start 查看监控列表。",
    "en": "✅ Stock monitor connected. This is a test message with no real market data. Reports arrive every trading day at 10:16, 12:00 and 15:30 ET. Send /start to view your watchlist."
  },
  "testSent": {
    "zh": "✓ 测试消息已发送。",
    "en": "✓ Test message sent."
  },
  "telegramUsage": {
    "zh": "用法：node scripts/telegram-setup.mjs bot|chat|webhook|test",
    "en": "Usage: node scripts/telegram-setup.mjs bot|chat|webhook|test"
  },
  "preflightOk": {
    "zh": "✓ SIP 权限通过：{date} SPY，30/30分钟；使用真实历史数据，不是实时数据。",
    "en": "✓ SIP access verified: {date} SPY, 30/30 minutes; real historical data, not live prices."
  },
  "preflightVolume": {
    "zh": "开盘半小时成交量：{volume} 股",
    "en": "Opening 30-minute volume: {volume} shares"
  },
  "preflightFailed": {
    "zh": "预检失败：{error}",
    "en": "Preflight failed: {error}"
  },
  "cloudFailed": {
    "zh": "云端预检 HTTP {status}。检查Worker日志、Secret及CPU上限。",
    "en": "Cloud preflight HTTP {status}. Check Worker logs, secrets and CPU limits."
  },
  "cloudOk": {
    "zh": "✓ 云端API预检通过：{date}，4只股票，完整开盘窗口，SIP。",
    "en": "✓ Cloud API verified: {date}, 4 symbols, complete opening window, SIP."
  },
  "telegramFailed": {
    "zh": "Telegram请求失败（{code}），请核对token与参数。",
    "en": "Telegram request failed ({code}); check your token and parameters."
  },
  "openBot": {
    "zh": "打开 https://t.me/{username} ，点击 Start 并发送 /start。",
    "en": "Open https://t.me/{username}, click Start and send /start."
  }
};

export function t(language, key, params = {}) {
  const message = messages[key]?.[languageOf(language)];
  if (message === undefined) throw new Error(`Unknown message key: ${key}`);
  return message.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}
