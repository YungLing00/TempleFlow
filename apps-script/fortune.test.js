import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('fortune catalog matches public file and AI interpretation stays server-side',()=>{
  const cache=new Map();
  const calls=[];
  let apiKey='test-key';
  const ctx={
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'javascript'},createTextOutput(text){return {text,setMimeType(){return this}}}},
    PropertiesService:{getScriptProperties(){return {getProperty(key){return {TEMPLEFLOW_SHEET_ID:'sheet',LINE_CHANNEL_ID:'2011717805',OPENAI_API_KEY:apiKey}[key]}}}},
    SpreadsheetApp:{openById(){return {getSheetByName(){return {getRange(){return {getDisplayValues(){return [['key','value']]}}}}}}}},
    CacheService:{getScriptCache(){return {get(k){return cache.get(k)||null},put(k,v){cache.set(k,v)}}}},
    LockService:{getScriptLock(){return {waitLock(){},releaseLock(){}}}},
    UrlFetchApp:{fetch(url,opts){
      calls.push({url,opts});
      if(url.includes('api.line.me'))return {getResponseCode:()=>200,getContentText:()=>'{"sub":"Utest"}'};
      assert.equal(opts.headers.Authorization,'Bearer test-key');
      const body=JSON.parse(opts.payload);
      assert.equal(body.store,false);
      assert.equal(body.model,'gpt-4.1-mini');
      assert.match(body.input,/第|籤號/);
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'先釐清目前能做的一件事。'}]}]})};
    }},
    Date,JSON,String,Object,Number,RegExp,Error
  };
  runInNewContext(readFileSync(new URL('./Code.gs',import.meta.url),'utf8'),ctx);
  const publicFortunes=JSON.parse(readFileSync(new URL('../fortunes.json',import.meta.url),'utf8'));
  const serverFortunes=runInNewContext('FORTUNES',ctx);
  assert.equal(JSON.stringify(serverFortunes),JSON.stringify(publicFortunes));
  assert.equal(publicFortunes.length,12);
  for(const fortune of publicFortunes)assert.deepEqual(fortune.poem.split('\n').map(line=>[...line].length),[7,7,7,7]);
  const config=JSON.parse(ctx.doGet({parameter:{action:'fortune_config'}}).text);
  assert.equal(config.aiReady,true);
  assert.doesNotMatch(JSON.stringify(config),/test-key/);
  const body={action:'interpretFortune',requestId:'12345678-1234-1234-1234-123456789abc',idToken:'line-token',number:4,topic:'工作學業',question:'如何安排下一步？',consent:true};
  const response=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).text);
  assert.equal(response.interpretation,'先釐清目前能做的一件事。');
  assert.equal(calls.filter(call=>call.url.includes('api.openai.com')).length,1);
  const receipt=ctx.doGet({parameter:{action:'receipt',requestId:body.requestId}}).text;
  assert.doesNotMatch(receipt,/line-token|test-key|Utest/);
  const withoutConsent=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({...body,consent:false})}}).text);
  assert.equal(withoutConsent.ok,false);
  const personal=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({...body,question:'聯絡我 0912345678'})}}).text);
  assert.equal(personal.ok,false);
  apiKey='';
  assert.equal(JSON.parse(ctx.doGet({parameter:{action:'fortune_config'}}).text).aiReady,false);
  assert.equal(JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).text).ok,false);
});
