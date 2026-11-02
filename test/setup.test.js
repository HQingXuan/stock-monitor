import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function register(url) {
  const script=new URL('../scripts/telegram-setup.mjs',import.meta.url).href;
  return spawnSync(process.execPath,['--input-type=module','-e',`
    globalThis.fetch=async()=>{console.log('WEBHOOK_API_CALLED');return Response.json({ok:true,result:true});};
    process.argv[2]='webhook';
    await import(${JSON.stringify(script)});
  `],{encoding:'utf8',env:{...process.env,WORKER_URL:url,TELEGRAM_BOT_TOKEN:'fake-token',TELEGRAM_WEBHOOK_SECRET:'fake-secret'}});
}

test('setup rejects account root before trying to register a non-existent bot endpoint',()=>{
  const r=register('https://personal-account.workers.dev');
  assert.equal(r.status,1);
  assert.ok(!r.stdout.includes('WEBHOOK_API_CALLED'));
  assert.match(r.stderr,/Worker/);
});

test('setup accepts full Worker address and registers webhook',()=>{
  const r=register('https://opening-stock-watch.personal-account.workers.dev');
  assert.equal(r.status,0,r.stderr);
  assert.ok(r.stdout.includes('WEBHOOK_API_CALLED'));
});
