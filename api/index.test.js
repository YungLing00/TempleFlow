import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import handler from './index.js';

const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.LINE_CHANNEL_ID='2011717805';
process.env.GOOGLE_SHEET_ID='test-sheet';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'test@example.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
process.env.ADMIN_LINE_USER_IDS='Uadmin';
const names=['appointments','lights','volunteers','pilgrimages','settings'];
const data=Object.fromEntries(names.map(x=>[x,[]]));
let writes=0;
global.fetch=async (url,options={})=>{
  const path=String(url);
  const ok=body=>({ok:true,json:async()=>body});
  if(path.includes('oauth2.googleapis.com'))return ok({access_token:'google-token',expires_in:3600});
  if(path.includes('api.line.me'))return ok({sub:options.body.get('id_token')==='admin'?'Uadmin':'Uuser'});
  if(path.endsWith('?fields=sheets.properties.title'))return ok({sheets:names.map(title=>({properties:{title}}))});
  if(path.includes(':append')){const name=decodeURIComponent(path.split('/values/')[1]).split('!')[0];data[name].push(JSON.parse(options.body).values[0]);writes++;return ok({updates:{updatedRows:1}})}
  if(path.includes('/values/')){const name=decodeURIComponent(path.split('/values/')[1]).split('!')[0];return ok({values:[[],...data[name]]})}
  throw Error('unexpected fetch '+path);
};
function call(method,url,body,token){
  return new Promise(resolve=>{
    const res={setHeader(){},status(code){this.code=code;return this},json(data){resolve({code:this.code,data})},end(){resolve({code:this.code})}};
    handler({method,url,body,headers:token?{authorization:'Bearer '+token}:{}},res);
  });
}
test('requires verified LINE identity and restricts admin',async()=>{
  assert.equal((await call('POST','/api/records/appointments',{name:'A'})).code,401);
  assert.equal((await call('GET','/api/admin/records',{},'user')).code,403);
  assert.equal((await call('GET','/api/me',{},'admin')).data.admin,true);
});
test('writes an application to the sheet and returns only own records',async()=>{
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const created=await call('POST','/api/records/appointments',{name:'苓苓',phone:'0912345678',date,slot:'上午 09:00–12:00',category:'平安'},'user');
  assert.equal(created.code,201);assert.equal(writes,1);
  const mine=await call('GET','/api/mine',{},'user');
  assert.equal(mine.data.records.length,1);
  assert.equal(mine.data.records[0].phone,undefined);
  assert.equal((await call('GET','/api/mine',{},'admin')).data.records.length,0);
  assert.equal((await call('GET','/api/admin/records',{},'admin')).data.records.length,1);
});
