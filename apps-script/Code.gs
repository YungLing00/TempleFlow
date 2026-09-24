/**
 * TempleFlow Google Sheets 後端。
 * Script Properties: TEMPLEFLOW_SHEET_ID、LINE_CHANNEL_ID。
 * 直接從 GitHub Pages 接收表單時不需要公開密鑰；LINE ID token 由伺服器向 LINE 驗證。
 * 若仍使用 Vercel 的管理後台，另設定 TEMPLEFLOW_SHARED_SECRET。
 * Web app 部署：以自己身分執行、存取權「任何人」。
 */
const HEADERS = {
  appointments: ['id','temple_id','line_user_id','name','phone','date','slot','category','status','created_at','client_request_id'],
  lights: ['id','temple_id','line_user_id','name','phone','type','status','created_at','payment_method','payment_status','client_request_id'],
  volunteers: ['id','temple_id','line_user_id','name','phone','date','role','status','created_at','client_request_id'],
  pilgrimages: ['id','temple_id','line_user_id','group','name','phone','date','time','people','buses','status','created_at','client_request_id'],
  turtles: ['id','temple_id','line_user_id','name','phone','item','festival_date','wish','status','fulfillment_status','created_at','client_request_id'],
  settings: ['key','value']
};
const FIELDS = {
  appointments:{name:40,phone:20,date:10,slot:40,category:30},
  lights:{name:40,phone:20,type:30},
  volunteers:{name:40,phone:20,date:10,role:30},
  pilgrimages:{group:80,name:40,phone:20,date:10,time:5,people:4,buses:3},
  turtles:{name:40,phone:20,item:40,festival_date:10,wish:100}
};
function json_(data,mime) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(mime||ContentService.MimeType.JSON);
}
function doGet(e) {
  const props=PropertiesService.getScriptProperties();
  let ready=!!(props.getProperty('TEMPLEFLOW_SHEET_ID')&&props.getProperty('LINE_CHANNEL_ID'));
  if(ready){try{sheet_('settings')}catch{ready=false}}
  const action=e&&e.parameter&&e.parameter.action;
  let result;
  if(action==='receipt') {
    const requestId=String(e.parameter.requestId||'');
    result=/^[a-f0-9-]{36}$/.test(requestId)?JSON.parse(CacheService.getScriptCache().get('receipt_'+requestId)||'null'):null;
    result=result||{pending:true};
  }else if(action==='location'){
    result=ready?publicLocation_():{ok:true,active:false};
  }else result={ok:true,service:'TempleFlow Apps Script',ready};
  const callback=String(e&&e.parameter&&e.parameter.callback||'');
  if(callback){
    if(!/^templeflow_cb_[a-zA-Z0-9_]{1,60}$/.test(callback))return json_({ok:false});
    return ContentService.createTextOutput(callback+'('+JSON.stringify(result)+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(result);
}
function sheet_(name) {
  if(!Object.prototype.hasOwnProperty.call(HEADERS,name))throw new Error('工作表名稱錯誤');
  const id=PropertiesService.getScriptProperties().getProperty('TEMPLEFLOW_SHEET_ID');
  if(!id)throw new Error('尚未設定試算表');
  const book=SpreadsheetApp.openById(id);
  let sheet=book.getSheetByName(name);
  if(!sheet){
    sheet=book.insertSheet(name);
    sheet.getRange(1,1,1,HEADERS[name].length).setValues([HEADERS[name]]);
    sheet.setFrozenRows(1);
  }
  const current=sheet.getRange(1,1,1,HEADERS[name].length).getDisplayValues()[0];
  if(current.some((value,index)=>value!==HEADERS[name][index]))throw new Error('工作表欄位不符，請使用全新專用試算表');
  return sheet;
}
function safe_(value){
  const str=String(value==null?'':value);
  return /^[\s]*[=+\-@\t\r]/.test(str)?"'"+str:str;
}
function lineUser_(idToken) {
  if(!idToken||typeof idToken!=='string'||idToken.length>6000)throw new Error('請先使用 LINE 登入');
  const channel=PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ID');
  if(!channel)throw new Error('尚未設定 LINE Channel ID');
  const response=UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify',{
    method:'post',contentType:'application/x-www-form-urlencoded',
    payload:{id_token:idToken,client_id:channel},muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)throw new Error('LINE 登入已失效，請重新登入');
  const profile=JSON.parse(response.getContentText());
  if(!profile.sub)throw new Error('無法確認 LINE 身分');
  return profile.sub;
}
function validate_(kind,input){
  if(!Object.prototype.hasOwnProperty.call(FIELDS,kind))throw new Error('服務類型錯誤');
  const values={};
  Object.keys(FIELDS[kind]).forEach(key=>{
    const value=String(input&&input[key]!=null?input[key]:'').trim();
    if(!value||value.length>FIELDS[kind][key])throw new Error('請檢查欄位：'+key);
    values[key]=value;
  });
  if(!/^[0-9+() -]{8,20}$/.test(values.phone))throw new Error('聯絡電話格式錯誤');
  if(values.date||values.festival_date){
    const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
    const date=values.date||values.festival_date;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today)throw new Error('日期不能早於今天');
  }
  if(values.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time))throw new Error('時間格式錯誤');
  if(values.people&&(+values.people<1||+values.people>1000))throw new Error('人數超出範圍');
  if(values.buses&&(+values.buses<0||+values.buses>100))throw new Error('遊覽車數超出範圍');
  return values;
}
function submit_(body){
  const requestId=String(body.requestId||'');
  if(!/^[a-f0-9-]{36}$/.test(requestId))throw new Error('申請編號格式錯誤');
  const user=lineUser_(body.idToken);
  const kind=String(body.kind||'');
  const input=validate_(kind,body.data);
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{
    const sheet=sheet_(kind), headers=HEADERS[kind];
    const last=sheet.getLastRow();
    if(last>1){
      const requestColumn=headers.indexOf('client_request_id')+1;
      const old=sheet.getRange(2,requestColumn,last-1,1).getDisplayValues();
      const index=old.findIndex(row=>row[0]===requestId);
      if(index!==-1){
        const id=sheet.getRange(index+2,1).getDisplayValue();
        return {ok:true,id,status:'待確認'};
      }
    }
    const id=Utilities.getUuid();
    const record=Object.assign({},input,{
      id,temple_id:'wenwanggong-demo',line_user_id:user,status:'待確認',
      created_at:new Date().toISOString(),client_request_id:requestId
    });
    if(kind==='turtles')record.fulfillment_status='尚未還願';
    if(kind==='lights')Object.assign(record,{payment_method:'LINE Pay',payment_status:'未付款'});
    const range=sheet.getRange(last+1,1,1,headers.length);
    range.setNumberFormat('@');
    range.setValues([headers.map(key=>safe_(record[key]))]);
    return {ok:true,id,status:'待確認'};
  }finally{lock.releaseLock()}
}
function turtleAction_(body){
  const user=lineUser_(body.idToken),id=String(body.id||'');
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw new Error('申請編號格式錯誤');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sheet=sheet_('turtles'),count=sheet.getLastRow();
    if(count<2)throw new Error('找不到申請紀錄');
    const rows=sheet.getRange(2,1,count-1,HEADERS.turtles.length).getDisplayValues();
    const index=rows.findIndex(row=>row[0]===id&&row[2]===user);
    if(index<0)throw new Error('找不到這個 LINE 帳號的申請');
    const row=rows[index],col=HEADERS.turtles.indexOf('fulfillment_status')+1;
    if(body.action==='reportFulfillment'){
      if(row[col-1]==='尚未還願'){
        sheet.getRange(index+2,col).setValue('已回報還願，待廟方確認');
        row[col-1]='已回報還願，待廟方確認';
      }
    }
    return {ok:true,id,status:row[8],fulfillmentStatus:row[col-1]};
  }finally{lock.releaseLock()}
}
function isAdmin_(user){
  const ids=PropertiesService.getScriptProperties().getProperty('ADMIN_LINE_USER_IDS')||'';
  return ids.split(',').map(x=>x.trim()).filter(Boolean).includes(user);
}
function locationAction_(body){
  const user=lineUser_(body.idToken);
  if(!isAdmin_(user))throw new Error('僅指定管理員可發布武轎位置');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sheet=sheet_('settings'),count=sheet.getLastRow();
    const keys=count>1?sheet.getRange(2,1,count-1,1).getDisplayValues().map(row=>row[0]):[];
    function set(key,value){
      const index=keys.indexOf(key),row=index<0?sheet.getLastRow()+1:index+2;
      sheet.getRange(row,1,1,2).setValues([[key,String(value)]]);
      if(index<0)keys.push(key);
    }
    if(body.action==='stopLocation'){set('parade_location','');return {ok:true,active:false}}
    const lat=Number(body.lat),lng=Number(body.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180)throw new Error('定位資料不正確');
    set('parade_location',JSON.stringify({lat,lng,updatedAt:new Date().toISOString()}));
    return {ok:true,active:true};
  }finally{lock.releaseLock()}
}
function publicLocation_(){
  const sheet=sheet_('settings'),count=sheet.getLastRow();
  const rows=count>1?sheet.getRange(2,1,count-1,2).getDisplayValues():[];
  const raw=rows.find(row=>row[0]==='parade_location');
  if(!raw||!raw[1])return {ok:true,active:false};
  try{
    const value=JSON.parse(raw[1]);
    if(Date.now()-Date.parse(value.updatedAt)>5*60*1000)return {ok:true,active:false};
    return {ok:true,active:true,lat:value.lat,lng:value.lng,updatedAt:value.updatedAt};
  }catch{return {ok:true,active:false}}
}
function proxy_(body){
  const props=PropertiesService.getScriptProperties();
  const secret=props.getProperty('TEMPLEFLOW_SHARED_SECRET');
  if(!secret||body.secret!==secret)throw new Error('未授權');
  const name=String(body.name||''),headers=HEADERS[name];
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sheet=sheet_(name);
    if(body.action==='list'){
      const count=sheet.getLastRow(),values=count>1?sheet.getRange(2,1,count-1,headers.length).getDisplayValues():[];
      return {ok:true,rows:values.map((row,i)=>{
        const item={_row:i+2};headers.forEach((key,j)=>item[key]=row[j]||'');return item;
      })};
    }
    if(body.action==='append'){
      const range=sheet.getRange(sheet.getLastRow()+1,1,1,headers.length);
      range.setNumberFormat('@');range.setValues([headers.map(key=>safe_((body.item||{})[key]))]);
      return {ok:true};
    }
    if(body.action==='update'){
      const row=Number(body.row),col=headers.indexOf(body.col)+1;
      if(!Number.isInteger(row)||row<2||row>sheet.getLastRow()||!col)throw new Error('更新位置不正確');
      const target=sheet.getRange(row,col);target.setNumberFormat('@');target.setValue(safe_(body.value));
      return {ok:true};
    }
    throw new Error('不支援的操作');
  }finally{lock.releaseLock()}
}
function doPost(e){
  let body,requestId;
  try{
    body=JSON.parse(e.postData.contents);
    requestId=String(body.requestId||'');
    const result=body.action==='submit'?submit_(body):
      ['turtleStatus','reportFulfillment'].includes(body.action)?turtleAction_(body):
      ['updateLocation','stopLocation'].includes(body.action)?locationAction_(body):
      body.action==='adminCheck'?{ok:true,admin:isAdmin_(lineUser_(body.idToken))}:proxy_(body);
    if(['submit','turtleStatus','reportFulfillment','updateLocation','stopLocation','adminCheck'].includes(body.action)&&/^[a-f0-9-]{36}$/.test(requestId))CacheService.getScriptCache().put('receipt_'+requestId,JSON.stringify(result),300);
    return json_(result);
  }catch(err){
    const result={ok:false,error:String(err.message||err)};
    if(body&&['submit','turtleStatus','reportFulfillment','updateLocation','stopLocation','adminCheck'].includes(body.action)&&/^[a-f0-9-]{36}$/.test(requestId))CacheService.getScriptCache().put('receipt_'+requestId,JSON.stringify(result),300);
    return json_(result);
  }
}
