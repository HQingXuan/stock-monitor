import { t } from '../src/messages.js';
import { loadEnv } from './env.mjs';
import { alpacaClient, buildReport } from '../src/alpaca.js';
import { nyParts, addDays } from '../src/core.js';
const env=loadEnv();
try {
  const today=nyParts(Date.now()).date;
  const calendar=await alpacaClient(env).calendar(addDays(today,-14),addDays(today,-1));
  if(!calendar.length) throw new Error(t(env.MESSAGE_LANGUAGE, 'noHistory'));
  const date=calendar.at(-1).date;
  const report=await buildReport(env,date,['SPY'],Date.now());
  if(!report.stocks[0]?.current.complete) throw new Error(t(env.MESSAGE_LANGUAGE, 'incompleteSpy'));
  console.log(t(env.MESSAGE_LANGUAGE, 'preflightOk', { date: date }));
  console.log(t(env.MESSAGE_LANGUAGE, 'preflightVolume', { volume: report.stocks[0].current.volume }));
} catch(e) { console.error(t(env.MESSAGE_LANGUAGE, 'preflightFailed', { error: e.message }));process.exitCode=1; }
