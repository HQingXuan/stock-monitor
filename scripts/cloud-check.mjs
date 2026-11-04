import { t } from '../src/messages.js';
import { loadEnv } from './env.mjs';
import { alpacaClient } from '../src/alpaca.js';
import { nyParts,addDays } from '../src/core.js';
const env=loadEnv();
try {
  const today=nyParts(Date.now()).date;
  const calendar=await alpacaClient(env).calendar(addDays(today,-14),addDays(today,-1));
  const date=calendar.at(-1)?.date;if(!date)throw new Error(t(env.MESSAGE_LANGUAGE, 'noRecent'));
  const response=await fetch(new URL('/api/preview',env.WORKER_URL),{
    method:'POST',headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`,'content-type':'application/json'},
    body:JSON.stringify({date,symbols:['SPY','QQQ','TQQQ','GOOG']}),signal:AbortSignal.timeout(60000)
  });
  if(!response.ok)throw new Error(t(env.MESSAGE_LANGUAGE, 'cloudFailed', { status: response.status }));
  const report=await response.json();
  if(report.stocks?.length!==4 || report.stocks.some(s=>!s.current.complete))throw new Error(t(env.MESSAGE_LANGUAGE, 'cloudIncomplete'));
  console.log(t(env.MESSAGE_LANGUAGE, 'cloudOk', { date: date }));
  console.log(t(env.MESSAGE_LANGUAGE, 'cloudCaveat'));
}catch(e){console.error(e.message);process.exitCode=1;}
