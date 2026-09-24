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
  settings: ['key','value']
};
const FIELDS = {
  appointments:{name:40,phone:20,date:10,slot:40,category:30},
  lights:{name:40,phone:20,type:30},
  volunteers:{name:40,phone:20,date:10,role:30},
  pilgrimages:{group:80,name:40,phone:20,date:10,time:5,people:4,buses:3}
};
function json_(data,mime) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(mime||ContentService.MimeType.JSON);
}
function doGet(e) {
  const props=PropertiesService.getScriptProperties();
  const ready=!!(props.getProperty('TEMPLEFLOW_SHEET_ID')&&props.getProperty('LINE_CHANNEL_ID'));
  const action=e&&e.parameter&&e.parameter.action;
  let result;
  if(action==='receipt') {
    const requestId=String(e.parameter.requestId||'');
    result=/^[a-f0-9-]{36}$/.test(requestId)?JSON.parse(CacheService.getScriptCache().get('receipt_'+requestId)||'null'):null;
    result=result||{pending:true};
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
  if(values.date){
    const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(values.date)||values.date<today)throw new Error('日期不能早於今天');
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
    if(kind==='lights')Object.assign(record,{payment_method:'LINE Pay',payment_status:'未付款'});
    const range=sheet.getRange(last+1,1,1,headers.length);
    range.setNumberFormat('@');
    range.setValues([headers.map(key=>safe_(record[key]))]);
    return {ok:true,id,status:'待確認'};
  }finally{lock.releaseLock()}
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
    const result=body.action==='submit'?submit_(body):proxy_(body);
    if(body.action==='submit')CacheService.getScriptCache().put('receipt_'+requestId,JSON.stringify(result),300);
    return json_(result);
  }catch(err){
    const result={ok:false,error:String(err.message||err)};
    if(body&&body.action==='submit'&&/^[a-f0-9-]{36}$/.test(requestId))CacheService.getScriptCache().put('receipt_'+requestId,JSON.stringify(result),300);
    return json_(result);
  }
}
