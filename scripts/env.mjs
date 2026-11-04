import { t, languageOf } from '../src/messages.js';
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
  for(const k of secretNames) if(!env[k]) throw new Error(t(env.MESSAGE_LANGUAGE, 'missingSecret', { key: k }));
}

export function deploymentConfig(template, env, databaseId) {
  const config = structuredClone(template);
  config.d1_databases[0].database_id = databaseId;
  config.vars.MESSAGE_LANGUAGE = languageOf(env.MESSAGE_LANGUAGE);
  config.vars.ALPACA_ACCOUNT_ENV = env.ALPACA_ACCOUNT_ENV || config.vars.ALPACA_ACCOUNT_ENV;
  return config;
}
