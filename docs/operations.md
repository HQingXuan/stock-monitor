# 配置与运维

## 本地配置

推荐使用 `bash scripts/setup.sh`。手动配置时：

```bash
umask 077
cp .setup.env.example .setup.env
chmod 600 .setup.env
```

用本地编辑器填写 `.setup.env`，不要把真实值粘进 GitHub、终端命令历史或问题报告。文件格式是字面量 `KEY=VALUE`，不加引号、不做变量替换；不要用 `source .setup.env`。脚本环境变量优先于该文件。

| 键 | 内容 |
| --- | --- |
| `ALPACA_KEY` / `ALPACA_SECRET` | 同一账户环境的一对 API 凭据 |
| `ALPACA_ACCOUNT_ENV` | 默认 `paper`；`live` 只切换日历 API 主机，不启用交易 |
| `TELEGRAM_BOT_TOKEN` | BotFather 提供的凭据 |
| `TELEGRAM_CHAT_ID` | 本人 Telegram 数字私聊 ID |
| `TELEGRAM_WEBHOOK_SECRET` | 随机 webhook 验证密钥 |
| `ADMIN_TOKEN` | 随机管理 API Bearer token |
| `WORKER_URL` | 部署输出的完整 `https://Worker名称.账户子域名.workers.dev` 地址 |

向导会生成两个随机 token。手动配置时可在安全终端分别运行 `node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'` 生成，避免录屏或共享终端日志。

`wrangler.jsonc` 只保存通用模板。部署脚本自动把真实 D1 UUID 写入被忽略的 `wrangler.local.json`，并通过标准输入上传 Secrets，不把密钥写进命令参数。`WORKER_URL` 留在本地，`ALPACA_ACCOUNT_ENV` 的云端值来自模板 `vars`；若改用 live 环境，本地配置与模板要保持一致。

## 分步操作

先 `npm ci`，再根据需要运行；下面不是无副作用的测试清单：

| 命令 | 实际行为 |
| --- | --- |
| `npm run preflight` | 使用真实 Alpaca key 读取最近历史行情 |
| `node scripts/telegram-setup.mjs bot` | 查询 Bot 身份 |
| `node scripts/telegram-setup.mjs chat` | 查询尚未配置 webhook 的 Bot 的私聊更新 |
| `npm run deploy` | 登录 Cloudflare、创建/复用 D1、迁移、部署、上传密钥 |
| `node scripts/telegram-setup.mjs webhook` | 设置该 Bot 的 webhook 地址 |
| `node scripts/telegram-setup.mjs test` | 向配置的私聊发送测试消息 |
| `node scripts/cloud-check.mjs` | 请求云端历史预览，不发送 Telegram 报告 |

部署脚本固定使用资源名称 `opening-stock-watch`，请选择对应账户；如果需要多实例，应先调整脚本中的资源名称和 Wrangler 模板，不能只更改一个地方。不要删除 D1 来解决普通配置问题，否则监控与发送记录会丢失。

## 管理 API

`GET /health` 无鉴权，只代表进程存活。以下接口要求 `Authorization: Bearer <ADMIN_TOKEN>`，勿把 token 放入 URL：

- `GET /api/status`：最近 7 次报告状态。
- `GET /api/report?date=YYYY-MM-DD`：已保存早盘报告，无报告返回 404；加 `&slot=noon` 或 `&slot=afternoon` 查询盘中报告。
- `POST /api/preview`：JSON `{"date":"YYYY-MM-DD","symbols":["SPY","QQQ"]}`，可加 `"slot":"noon"` 或 `"slot":"afternoon"`，默认 `opening`；即时读取指定历史窗口；不发送消息、不保存日报。

使用本地配置安全读取状态的示例（不会在命令历史里写出密钥）：

```bash
node --input-type=module <<'JS'
import { loadEnv } from './scripts/env.mjs';
const env = loadEnv();
const r = await fetch(new URL('/api/status', env.WORKER_URL), {
  headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` }
});
if (!r.ok) throw new Error(`HTTP ${r.status}`);
console.log(await r.json());
JS
```

## 调度和停止监控

模板 UTC cron 为 `16-26 14,15 * * MON-FRI`、`0-10 16,17 * * MON-FRI`、`30-40 19,20 * * MON-FRI`。应用按 America/New_York 仅允许 10:16–10:26、12:00–12:10、15:30–15:40 执行，自动过滤另一季节对应的 UTC 小时。实际交易日由 Alpaca 日历确认。每个时段独立去重与重试；早盘键仍为日期，新增键为日期加 `-noon` / `-afternoon`，无需迁移 D1。

现有部署升级时，更新代码以及实际部署配置的 `triggers.crons`，再部署 Worker；只推送 GitHub 不会更新线上服务。保留原 D1 绑定、Secrets 和 webhook。Cloudflare 定时触发和外部服务可能延迟，因此时间是计划开始时间，不保证消息精确到秒送达。

暂停个股用 `/stop SYMBOL`。暂停全部监控可先 `/list`，再 `/stop` 删除全部活跃标的；列表不会因为下一次初始化又自动补回。也可在 Cloudflare 控制台停用 cron。代码重新部署时模板里的 cron 可能恢复，暂停状态需要相应维护配置。保留 D1 以保留发送记录。

## 排错

| 现象 | 检查 |
| --- | --- |
| 没收到报告 | `/list` 是否过期；是否交易日；`/status`；cron 是否启用、时区是否正确 |
| 401 | Alpaca key / 环境是否匹配，或管理 API token 是否正确 |
| 403 | SIP 数据权限、请求延迟是否满足；不会自动降级行情源 |
| 409 | 请求的数据距离现在不足 16 分钟 |
| 429 | 数据提供商限流；查看后续重试 |
| `uncertain` | 消息可能已送达，先人工核实；不要直接删发送记录重发 |
| `error` | 检查 Worker 日志、Secrets、D1 迁移和数据完整性 |
| `no-active-watches` | 所有监控已过期或删除，使用 `/watch` 添加 |
| `/health` 正常但没有日报 | 健康检查不验证行情、cron 或 Telegram，检查历史预览及真实交易日发送 |
| Worker URL 被拒绝 | 需要完整 Worker 地址，不能只填账户子域名 |

运行日志、预览 JSON 和 D1 导出可能包含私有监控列表、价格数据或通知状态，请勿直接上传公开仓库。项目没有自动删除历史记录的任务；按实际需求管理数据保留。

## 数据口径与限制

- 使用 Alpaca `feed=sip`、`timeframe=1Min`、`adjustment=split`；没有权限时明确失败，不静默切换 IEX。
- 所有请求窗口结束时间必须早于当前时间至少 16 分钟（15 分钟延迟加 1 分钟缓冲）。
- 窗口涨跌幅为 `窗口最后一分钟 close / 09:30 open - 1`；早盘窗口最后一分钟为 09:59。
- 昨收参考为前一交易日最后一分钟的收盘价；半日市使用其实际收盘时间。它不是官方收盘竞价价格。
- 历史比较取前 5 个交易日同一开盘窗口；均量至少要求 3 个完整历史样本。盘中报告比较开盘以来同长度窗口。数据仅做拆股调整，不含分红总回报。
- 缺失、重复或无效分钟数据标记为不完整，不补零，不伪造方向判断；“昨日”不使用更早交易日替代。
- 迷你走势图各自缩放，不能直接比较振幅；成交量不是主动买卖资金流，报告不预测走势。
- 发送状态按日期与时段独立保存在 D1，旧早盘记录保持兼容，无需数据库迁移。网络结果不确定时标记 `uncertain`，避免盲目重发；不保证绝对不漏发或 exactly-once。
- D1 报告与状态没有自动清理策略，长期运行需要自行检查存储量。数据和 Telegram 通信受各自服务条款、权限和可用性约束。

## 开发与验证

```bash
npm test
npm run demo
npm run smoke
npx wrangler deploy --dry-run --outdir /tmp/stock-monitor-build
```

测试使用模拟外部 API；smoke 在本地 workerd 和 D1 上验证运行时。以上命令不发送真实 Telegram 消息，dry-run 只构建、不部署。部署后应在下一个交易日确认定时报告实际送达。费用、配额与数据权限取决于账户套餐，本项目不承诺永久免费。

### 代码结构

```text
src/core.js             时间、数据完整性、统计、报告排版
src/alpaca.js           交易日历、SIP 分钟数据、分页与报告构建
src/worker.js           定时任务、Telegram 命令、D1 状态与管理 API
migrations/0001.sql    D1 表结构
scripts/setup.sh       交互式部署向导
scripts/deploy.mjs     Cloudflare 部署与 Secrets 上传
scripts/preflight.mjs  本地 Alpaca 权限预检（访问真实 API）
scripts/cloud-check.mjs 云端历史预览检查（访问真实 API）
scripts/demo.mjs       合成数据示例
scripts/worker-smoke.mjs 本地运行时测试
test/                 单元与集成测试
```
