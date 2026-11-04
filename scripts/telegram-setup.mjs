import { t } from '../src/messages.js';
import { loadEnv } from './env.mjs';
const env=loadEnv();
const mode=process.argv[2];
async function api(method,body) {
  let response;
  try {response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });}catch{throw new Error(t(env.MESSAGE_LANGUAGE, 'telegramNetwork'));}
  const result=await response.json();if(!result.ok)throw new Error(t(env.MESSAGE_LANGUAGE, 'telegramFailed', { code: result.error_code }));
  return result.result;
}
try {
  if(!env.TELEGRAM_BOT_TOKEN)throw new Error(t(env.MESSAGE_LANGUAGE, 'missingBot'));
  if(mode==='bot') {
    const bot=await api('getMe',{});console.log(t(env.MESSAGE_LANGUAGE, 'openBot', { username: bot.username }));
  } else if(mode==='chat') {
    const info=await api('getWebhookInfo',{});
    if(info.url) throw new Error(t(env.MESSAGE_LANGUAGE, 'existingWebhook'));
    const updates=await api('getUpdates',{timeout:0,allowed_updates:['message']});
    const ids=[...new Set(updates.filter(u=>u.message?.chat?.type==='private' && u.message.from?.id===u.message.chat.id).map(u=>String(u.message.chat.id)))];
    if(!ids.length)throw new Error(t(env.MESSAGE_LANGUAGE, 'noChat'));
    console.log(t(env.MESSAGE_LANGUAGE, 'chatIds')+ids.join(', '));
  } else if(mode==='webhook') {
    const origin=new URL(env.WORKER_URL);
    if(origin.protocol!=='https:' || !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(origin.hostname) || origin.username || origin.password || origin.port || origin.pathname!=='/' || origin.search || origin.hash) {
      throw new Error(t(env.MESSAGE_LANGUAGE, 'workerUrl'));
    }
    await api('setWebhook',{url:new URL('/telegram',origin).toString(),secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message']});
    console.log(t(env.MESSAGE_LANGUAGE, 'webhookDone'));
  } else if(mode==='test') {
    if(!/^\d+$/.test(env.TELEGRAM_CHAT_ID||''))throw new Error(t(env.MESSAGE_LANGUAGE, 'invalidChat'));
    await api('sendMessage',{chat_id:env.TELEGRAM_CHAT_ID,text:t(env.MESSAGE_LANGUAGE, 'testMessage')});
    console.log(t(env.MESSAGE_LANGUAGE, 'testSent'));
  } else throw new Error(t(env.MESSAGE_LANGUAGE, 'telegramUsage'));
}catch(e){console.error(e.message);process.exitCode=1;}
