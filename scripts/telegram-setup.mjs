import { loadEnv } from './env.mjs';
const env=loadEnv();
const mode=process.argv[2];
async function api(method,body) {
  let response;
  try {response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });}catch{throw new Error('Telegram网络请求失败。');}
  const result=await response.json();if(!result.ok)throw new Error(`Telegram请求失败（${result.error_code}），请核对token与参数。`);
  return result.result;
}
try {
  if(!env.TELEGRAM_BOT_TOKEN)throw new Error('缺少TELEGRAM_BOT_TOKEN');
  if(mode==='bot') {
    const bot=await api('getMe',{});console.log(`打开 https://t.me/${bot.username} ，点击 Start 并发送 /start。`);
  } else if(mode==='chat') {
    const info=await api('getWebhookInfo',{});
    if(info.url) throw new Error('此bot已配置webhook。重跑向导时保留已存的CHAT_ID；不要改变其他bot的webhook。');
    const updates=await api('getUpdates',{timeout:0,allowed_updates:['message']});
    const ids=[...new Set(updates.filter(u=>u.message?.chat?.type==='private' && u.message.from?.id===u.message.chat.id).map(u=>String(u.message.chat.id)))];
    if(!ids.length)throw new Error('未找到私聊。请给刚创建的bot发送 /start 后重试。');
    console.log('私聊ID（选择你自己的）：'+ids.join(', '));
  } else if(mode==='webhook') {
    const origin=new URL(env.WORKER_URL);
    if(origin.protocol!=='https:' || !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(origin.hostname) || origin.username || origin.password || origin.port || origin.pathname!=='/' || origin.search || origin.hash) {
      throw new Error('需要完整Worker地址：https://Worker名称.账户子域名.workers.dev；只有账户子域名.workers.dev不能连接bot。请复制Wrangler部署输出的完整地址。');
    }
    await api('setWebhook',{url:new URL('/telegram',origin).toString(),secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message']});
    console.log('✓ 私聊命令webhook已配置。');
  } else if(mode==='test') {
    if(!/^\d+$/.test(env.TELEGRAM_CHAT_ID||''))throw new Error('缺少有效私聊ID');
    await api('sendMessage',{chat_id:env.TELEGRAM_CHAT_ID,text:'✅ 股票监控bot已连接。这是一条测试消息，不包含真实行情。每个交易日10:16 ET发送09:30–10:00日报。发送 /start 查看监控列表。'});
    console.log('✓ 测试消息已发送。');
  } else throw new Error('用法：node scripts/telegram-setup.mjs bot|chat|webhook|test');
}catch(e){console.error(e.message);process.exitCode=1;}
