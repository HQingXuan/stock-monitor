import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
test('public deployment template contains only a placeholder database binding',()=>{
  const config=JSON.parse(readFileSync(new URL('wrangler.jsonc',root),'utf8'));
  assert.equal(config.d1_databases.length,1);
  assert.equal(config.d1_databases[0].binding,'DB');
  assert.equal(config.d1_databases[0].database_id,'REPLACE_WITH_YOUR_D1_DATABASE_ID');
  assert.ok(!config.account_id);
  for(const key of Object.keys(config.vars)) assert.ok(!/TOKEN|SECRET|CHAT_ID|KEY/.test(key));
});
test('Git excludes private files but permits the empty setup example',()=>{
  const privatePaths=['.setup.env','.setup.env.bak','.env.production','.dev.vars','wrangler.local.json','wrangler.local.json.bak','local-reports/report.json','server.pem','debug.log'];
  const result=spawnSync('git',['check-ignore','--no-index','--stdin'],{cwd:root,encoding:'utf8',input:privatePaths.join('\n')+'\n'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'),privatePaths);
  const example=readFileSync(new URL('.setup.env.example',root),'utf8');
  for(const line of example.split('\n').filter(l=>l && !l.startsWith('#'))) {
    const [key,value]=line.split('=');
    assert.equal(value,key==='ALPACA_ACCOUNT_ENV'?'paper':'');
  }
  const allowed=spawnSync('git',['check-ignore','--no-index','.setup.env.example'],{cwd:root});
  assert.equal(allowed.status,1);
});
