import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function loadEnv() {
  let text='';
  try { text=readFileSync(new URL('../.setup.env',import.meta.url),'utf8'); } catch {}
  // Parse literal KEY=VALUE; never execute shell code or expand substitutions.
  const saved=Object.fromEntries(text.split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{
    const index=l.indexOf('=');return [l.slice(0,index),l.slice(index+1)];
  }));
  return {...saved,...process.env};
}
export const secretNames=['ALPACA_KEY','ALPACA_SECRET','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','TELEGRAM_WEBHOOK_SECRET','ADMIN_TOKEN'];
export function requireSecrets(env) {
  for(const k of secretNames) if(!env[k]) throw new Error(`缺少 ${k}。先运行账户向导。`);
}
