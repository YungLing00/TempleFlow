/**
 * TempleFlow 的 Apps Script 資料代理。
 * 在 Apps Script「專案設定 → 指令碼屬性」設定：
 * TEMPLEFLOW_SHEET_ID、TEMPLEFLOW_SHARED_SECRET。
 * 部署為網頁應用程式：以自己身分執行，存取權「任何人」。
 * 密鑰只保存在此處及 Vercel 環境變數，不要放在網頁前端。
 */
const HEADERS = {
  appointments: ['id','temple_id','line_user_id','name','phone','date','slot','category','status','created_at'],
  lights: ['id','temple_id','line_user_id','name','phone','type','status','created_at','payment_method','payment_status'],
  volunteers: ['id','temple_id','line_user_id','name','phone','date','role','status','created_at'],
  pilgrimages: ['id','temple_id','line_user_id','group','name','phone','date','time','people','buses','status','created_at'],
  settings: ['key','value']
};

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  const props=PropertiesService.getScriptProperties();
  return json_({ok:true,service:'TempleFlow Apps Script',ready:!!(props.getProperty('TEMPLEFLOW_SHEET_ID')&&props.getProperty('TEMPLEFLOW_SHARED_SECRET'))});
}
function doPost(e) {
  try {
    const props=PropertiesService.getScriptProperties();
    const secret=props.getProperty('TEMPLEFLOW_SHARED_SECRET');
    const sheetId=props.getProperty('TEMPLEFLOW_SHEET_ID');
    if(!secret || !sheetId) throw new Error('請先設定指令碼屬性');
    const body=JSON.parse(e.postData.contents);
    if(body.secret!==secret) throw new Error('未授權');
    if(!Object.prototype.hasOwnProperty.call(HEADERS,body.name))throw new Error('工作表名稱錯誤');
    const name=body.name,headers=HEADERS[name];
    const lock=LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const book=SpreadsheetApp.openById(sheetId);
      let sheet=book.getSheetByName(name);
      if(!sheet){
        sheet=book.insertSheet(name);
        sheet.getRange(1,1,1,headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
      }
      if(body.action==='list'){
        const count=sheet.getLastRow();
        const values=count>1?sheet.getRange(2,1,count-1,headers.length).getDisplayValues():[];
        const rows=values.map((values,i)=>{
          const item={_row:i+2};
          headers.forEach((key,j)=>item[key]=values[j]||'');
          return item;
        });
        return json_({ok:true,rows});
      }
      if(body.action==='append'){
        const item=body.item||{};
        const values=headers.map(key=>String(item[key]??''));
        const range=sheet.getRange(sheet.getLastRow()+1,1,1,headers.length);
        range.setNumberFormat('@');
        range.setValues([values.map(s=>/^[\s]*[=+\-@\t\r]/.test(s)?"'"+s:s)]);
        return json_({ok:true});
      }
      if(body.action==='update'){
        const row=Number(body.row),col=headers.indexOf(body.col)+1;
        if(!Number.isInteger(row)||row<2||row>sheet.getLastRow()||!col)throw new Error('更新位置不正確');
        const value=String(body.value??'');
        const target=sheet.getRange(row,col);
        target.setNumberFormat('@');
        target.setValue(/^[\s]*[=+\-@\t\r]/.test(value)?"'"+value:value);
        return json_({ok:true});
      }
      throw new Error('不支援的操作');
    } finally {lock.releaseLock()}
  }catch(err){return json_({ok:false,error:String(err.message||err)})}
}
