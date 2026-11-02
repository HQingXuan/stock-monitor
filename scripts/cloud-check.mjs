import { loadEnv } from './env.mjs';
import { alpacaClient } from '../src/alpaca.js';
import { nyParts,addDays } from '../src/core.js';
const env=loadEnv();
try {
  const today=nyParts(Date.now()).date;
  const calendar=await alpacaClient(env).calendar(addDays(today,-14),addDays(today,-1));
  const date=calendar.at(-1)?.date;if(!date)throw new Error('没有最近交易日。');
  const response=await fetch(new URL('/api/preview',env.WORKER_URL),{
    method:'POST',headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`,'content-type':'application/json'},
    body:JSON.stringify({date,symbols:['SPY','QQQ','TQQQ','GOOG']}),signal:AbortSignal.timeout(60000)
  });
  if(!response.ok)throw new Error(`云端预检 HTTP ${response.status}。检查Worker日志、Secret及CPU上限。`);
  const report=await response.json();
  if(report.stocks?.length!==4 || report.stocks.some(s=>!s.current.complete))throw new Error('云端返回数据不完整。');
  console.log(`✓ 云端API预检通过：${date}，4只股票，完整开盘窗口，SIP。`);
  console.log('这证明当前云端请求可用；首个交易日仍需检查定时发送和Cloudflare CPU用量。');
}catch(e){console.error(e.message);process.exitCode=1;}
