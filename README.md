# stock-monitor

美股 / ETF 开盘与盘中监测工具：读取 Alpaca 分钟行情，由 Cloudflare Workers 定时生成报告，使用 D1 保存状态，再向指定 Telegram 私聊发送日报。仅监测，不提交交易订单；不支持期权。

## 报告内容与时间

- 分析窗口：美东时间 **09:30（含）至 10:00（不含）**，30 根一分钟 K 线。
- 发送时间：交易日 **10:16 ET** 起；10:16–10:26 为重试窗口。程序按 `America/New_York` 判断时间，支持夏令时，休市日不发送。
- 新增盘中总结：交易日 **12:00 ET**、**15:30 ET** 起发送，分别有 10 分钟重试窗口。沿用当前有效关注列表，覆盖 09:30–11:44、09:30–15:14（不含终点）；半日市截止实际收盘，休市日不发送。价格取窗口最后一分钟收盘，成交量为开盘以来累计量，并比较前 5 个交易日同长度窗口；历史半日市不足该长度时不纳入均量。重试保持数据窗口不变。
- 报告展示窗口价格走势、涨跌幅、成交量、6 个五分钟分段和历史比较。
- 默认股票：`SPY,QQQ,TQQQ,GOOG`；最多 15 只，同时支持自选美股 / ETF。
- 默认监控 7 个自然日，含建立当天；到期需要 `/watch` 续期，周末也计入天数。

这是延迟行情日报，不是实时逐笔行情。10:16 收到的窗口末价来自 09:59 分钟 K 线收盘，而不是 10:16 的实时价格。

## 本地试运行：无需账户或密钥

需要 Node.js **22.13.0 或以上**，以及 npm。交互式配置脚本需要 Bash（macOS、Linux 或 WSL）。

```bash
git clone https://github.com/HQingXuan/stock-monitor.git
cd stock-monitor
npm ci
npm test
npm run demo
npm run smoke
```

`npm test` 使用 Node 测试运行器、内存 SQLite 和模拟外部 API；`demo` 使用合成数据，结果写入被 Git 忽略的 `local-reports/demo.txt` 和 `demo.json`。`smoke` 用本地 workerd 和 D1 检验真实 Worker 运行时，外部行情和 Telegram 均被模拟；以上操作不发送手机消息，也不需要云端凭据。

## 部署到自己的账户

准备：Cloudflare 账户、Alpaca API Key/Secret（默认 paper 环境），以及通过 Telegram 官方 BotFather 创建的独立 Bot。能否读取延迟 SIP 数据取决于账户权限；先执行预检，不要把“有 API key”视为数据权限保证。

```bash
bash scripts/setup.sh
```

向导依次执行：

1. 提示准备 Cloudflare 账户。
2. 隐藏输入 Alpaca key/secret，读取历史行情验证 SIP 权限。
3. 隐藏输入 Telegram bot token，提示向自己的 Bot 发送 `/start`。
4. 获取并确认自己的私聊 ID，生成管理 token 和 webhook secret。
5. 安装依赖、执行测试、浏览器登录 Cloudflare、创建或复用名为 `opening-stock-watch` 的 D1、迁移表、部署 Worker、上传 Secrets。
6. 输入完整 Worker URL，配置 Telegram webhook，**发送一条测试消息**，检查云端历史报告接口。

向导会实际修改你授权的 Cloudflare / Telegram 配置；迁移源码或运行离线测试不会执行这些操作。不要对其他项目正在使用的 Bot 运行此向导；同名 Worker / D1 也可能被复用。支持 Ctrl-C 退出、重新运行保留已填值；重复运行并不是无副作用的检查。

需要手动配置或分步排错时，参见 [配置与运维](docs/operations.md)。部署完成后，应在下一个交易日确认定时报告确实送达；健康检查或历史预览通过并不证明 cron 已正常触发。

## Telegram 使用方法

仅配置的本人私聊可用，其他聊天的命令被忽略。

| 命令 | 用途 |
| --- | --- |
| `/start` 或 `/list` | 查看监控列表、到期日与帮助 |
| `/watch SPY,QQQ 7` | 添加或续期这两只股票 7 个自然日 |
| `/watch GOOG,NVDA,TSM,MSFT,MO,KO,COST 30` | 监控指定股票 30 个自然日 |
| `/stop SPY,QQQ` | 删除这两只股票的监控 |
| `/status` | 查看最近一次日报状态 |

股票列表用逗号分隔，天数范围 1–365，省略天数默认为 7。`/watch` 不删除列表里的其他股票，也不会补发当天已处理的日报。初始股票只在 D1 首次初始化时写入；以后修改 `INITIAL_SYMBOLS` 不会覆盖已有列表，请用命令管理。

## 数据口径与限制

- 使用 Alpaca `feed=sip`、`timeframe=1Min`、`adjustment=split`；没有权限时明确失败，不静默切换 IEX。
- 所有请求窗口结束时间必须早于当前时间至少 16 分钟（15 分钟延迟加 1 分钟缓冲）。
- 窗口涨跌幅为 `09:59 close / 09:30 open - 1`。
- 昨收参考为前一交易日最后一分钟的收盘价；半日市使用其实际收盘时间。它不是官方收盘竞价价格。
- 历史比较取前 5 个交易日同一开盘窗口；均量至少要求 3 个完整历史样本。盘中报告比较开盘以来同长度窗口。数据仅做拆股调整，不含分红总回报。
- 缺失、重复或无效分钟数据标记为不完整，不补零，不伪造方向判断；“昨日”不使用更早交易日替代。
- 迷你走势图各自缩放，不能直接比较振幅；成交量不是主动买卖资金流，报告不预测走势。
- 发送状态按日期与时段独立保存在 D1，旧早盘记录保持兼容，无需数据库迁移。网络结果不确定时标记 `uncertain`，避免盲目重发；不保证绝对不漏发或 exactly-once。
- D1 报告与状态没有自动清理策略，长期运行需要自行检查存储量。数据和 Telegram 通信受各自服务条款、权限和可用性约束。

## 代码结构

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

## 隐私与安全

仓库只包含公共模板及模拟数据，不包含原部署的密钥、聊天 ID、账户 / 数据库 ID、Worker 地址、运行报告或原项目历史。原有 LICENSE 保留。

`.setup.env` 是**明文**本地配置，向导使用权限 `600`；云端凭据通过 Wrangler Secrets 上传，不写入公共 `vars`。`.gitignore` 排除了真实环境文件、`wrangler.local.*`、报告、日志、依赖和密钥文件。Git 忽略规则不能保护已经跟踪的文件，也不能代替提交前内容检查。详见 [SECURITY.md](SECURITY.md)。

## 验证与服务限制

```bash
npm test
npm run demo
npm run smoke
npx wrangler deploy --dry-run --outdir /tmp/stock-monitor-build
```

最后一项只构建，不部署。实际部署使用 `npm run deploy` 或向导；首次完整配置推荐向导。费用、配额和数据权限由账户套餐决定，本项目不承诺永久免费，也不会主动升级套餐。

MIT 许可证见 [LICENSE](LICENSE)。
