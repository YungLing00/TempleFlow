import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('direct GitHub form verifies LINE, writes once and returns a minimal receipt',()=>{
  const cache=new Map(),sheets=new Map();
  const context={
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'javascript'},createTextOutput(text){return {text,setMimeType(type){this.mime=type;return this}}}},
    PropertiesService:{getScriptProperties(){return {getProperty(key){return {TEMPLEFLOW_SHEET_ID:'sheet',LINE_CHANNEL_ID:'2011717805',ADMIN_LINE_USER_IDS:'Utest'}[key]}}}},
    UrlFetchApp:{fetch(url,options){assert.match(url,/api.line.me/);assert.equal(options.payload.client_id,'2011717805');return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({sub:'Utest'})}}},
    LockService:{getScriptLock(){return {waitLock(){},releaseLock(){}}}},
    CacheService:{getScriptCache(){return {put(k,v){cache.set(k,v)},get(k){return cache.get(k)||null}}}},
    Utilities:{formatDate(){return '2026-09-24'},getUuid(){return 'saved-uuid'}},
    SpreadsheetApp:{openById(){return {getSheetByName(name){return sheets.get(name)||null},insertSheet(name){
      const grid=[];
      const sheet={
        setFrozenRows(){},getLastRow(){return grid.length},getRange(row,col,height=1,width=1){return {
          setNumberFormat(){return this},setValues(values){values.forEach((v,i)=>{grid[row-1+i]??=[];v.forEach((cell,j)=>grid[row-1+i][col-1+j]=cell)});return this},
          setValue(value){grid[row-1][col-1]=value;return this},
          getDisplayValues(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>grid[row-1+i]?.[col-1+j]||''))},
          getDisplayValue(){return grid[row-1]?.[col-1]||''}
        }}
      };
      sheets.set(name,sheet);return sheet;
    }}}},
    Date,JSON,String,Object,Number,RegExp,Error
  };
  runInNewContext(readFileSync(new URL('./Code.gs',import.meta.url),'utf8'),context);
  const body={action:'submit',requestId:'12345678-1234-1234-1234-123456789abc',idToken:'line-token',kind:'lights',data:{name:'苓苓',phone:'0912345678',type:'光明燈'}};
  const response=context.doPost({postData:{contents:JSON.stringify(body)}});
  assert.equal(JSON.parse(response.text).id,'saved-uuid');
  const again=context.doPost({postData:{contents:JSON.stringify(body)}});
  assert.equal(JSON.parse(again.text).id,'saved-uuid');
  assert.equal(sheets.get('lights').getLastRow(),2);
  const receipt=context.doGet({parameter:{action:'receipt',requestId:body.requestId,callback:'templeflow_cb_test'}});
  assert.equal(receipt.mime,'javascript');
  assert.match(receipt.text,/saved-uuid/);
  assert.doesNotMatch(receipt.text,/苓苓|0912345678|line-token/);
  const turtle={...body,requestId:'12345678-1234-1234-1234-123456789abd',kind:'turtles',data:{name:'苓苓',phone:'0912345678',item:'平安龜',festival_date:'2026-10-01',wish:'平安'}};
  assert.equal(JSON.parse(context.doPost({postData:{contents:JSON.stringify(turtle)}}).text).id,'saved-uuid');
  const status={action:'turtleStatus',id:'saved-uuid',idToken:'line-token',requestId:'12345678-1234-1234-1234-123456789abe'};
  assert.equal(JSON.parse(context.doPost({postData:{contents:JSON.stringify(status)}}).text).fulfillmentStatus,'尚未還願');
  assert.equal(JSON.parse(context.doPost({postData:{contents:JSON.stringify({...status,action:'reportFulfillment'})}}).text).fulfillmentStatus,'已回報還願，待廟方確認');
  const update={action:'updateLocation',idToken:'line-token',requestId:'12345678-1234-1234-1234-123456789abf',lat:23.57,lng:119.57};
  assert.equal(JSON.parse(context.doPost({postData:{contents:JSON.stringify(update)}}).text).active,true);
  assert.equal(JSON.parse(context.doGet({parameter:{action:'location'}}).text).lat,23.57);
  assert.equal(JSON.parse(context.doPost({postData:{contents:JSON.stringify({...update,action:'stopLocation'})}}).text).active,false);
  assert.equal(JSON.parse(context.doGet({parameter:{action:'location'}}).text).active,false);
});
