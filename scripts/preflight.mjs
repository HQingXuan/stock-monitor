import { loadEnv } from './env.mjs';
import { alpacaClient, buildReport } from '../src/alpaca.js';
import { nyParts, addDays } from '../src/core.js';
const env=loadEnv();
try {
  const today=nyParts(Date.now()).date;
  const calendar=await alpacaClient(env).calendar(addDays(today,-14),addDays(today,-1));
  if(!calendar.length) throw new Error('没有可供验证的历史交易日。');
  const date=calendar.at(-1).date;
  const report=await buildReport(env,date,['SPY'],Date.now());
  if(!report.stocks[0]?.current.complete) throw new Error('SIP请求成功，但SPY开盘半小时分钟数据不完整。');
  console.log(`✓ SIP 权限通过：${date} SPY，30/30分钟；使用真实历史数据，不是实时数据。`);
  console.log(`开盘半小时成交量：${report.stocks[0].current.volume} 股`);
} catch(e) { console.error(`预检失败：${e.message}`);process.exitCode=1; }
