import { createSign, randomUUID } from 'node:crypto';

const SHEETS = {
  appointments: ['id','temple_id','line_user_id','name','phone','date','slot','category','status','created_at'],
  lights: ['id','temple_id','line_user_id','name','phone','type','status','created_at'],
  volunteers: ['id','temple_id','line_user_id','name','phone','date','role','status','created_at'],
  pilgrimages: ['id','temple_id','line_user_id','group','name','phone','date','time','people','buses','status','created_at'],
  settings: ['key','value']
};
const templeId = 'wenwanggong-demo';
const allowedStatus = ['待確認','已確認','已取消','已完成'];
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const maps = { appointments: {name:40,phone:20,date:10,slot:40,category:30}, lights:{name:40,phone:20,type:30}, volunteers:{name:40,phone:20,date:10,role:30}, pilgrimages:{group:80,name:40,phone:20,date:10,time:5,people:4,buses:3} };
let cachedToken = null;
let bootstrapped = false;
const env = () => {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const channelId = process.env.LINE_CHANNEL_ID;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!sheetId || !channelId || !raw) throw new Error('後端尚未設定 Google Sheet 與 LINE Channel');
  let account;
  try { account = JSON.parse(raw); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 格式錯誤'); }
  if (!account.client_email || !account.private_key) throw new Error('Google Service Account 缺少必要欄位');
  return { sheetId, channelId, account };
};
const base64url = data => Buffer.from(JSON.stringify(data)).toString('base64url');
async function googleToken(account) {
  if (cachedToken?.email === account.client_email && cachedToken.expires > Date.now()) return cachedToken.value;
  const now = Math.floor(Date.now()/1000);
  const header = base64url({alg:'RS256',typ:'JWT'});
  const payload = base64url({iss:account.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const unsigned = header+'.'+payload;
  const signer = createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const jwt = unsigned+'.'+signer.sign(account.private_key.replace(/\\n/g,'\n')).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  const result = await response.json();
  if(!response.ok) throw new Error('Google 授權失敗：請確認服務帳號已加入試算表');
  cachedToken = {email:account.client_email,value:result.access_token,expires:Date.now()+(result.expires_in-120)*1000};
  return cachedToken.value;
}
async function sheets(path, options={}) {
  const {sheetId,account} = env();
  const token=await googleToken(account);
  const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+path,{...options,headers:{authorization:'Bearer '+token,'content-type':'application/json',...options.headers}});
  const result=await response.json();
  if(!response.ok) throw new Error('試算表操作失敗：'+(result.error?.message||response.status));
  return result;
}
async function ensureSheets(){
  if(bootstrapped)return;
  const book=await sheets('?fields=sheets.properties.title');
  const existing=new Set((book.sheets||[]).map(s=>s.properties.title));
  const missing=Object.keys(SHEETS).filter(name=>!existing.has(name));
  if(missing.length)await sheets(':batchUpdate',{method:'POST',body:JSON.stringify({requests:missing.map(title=>({addSheet:{properties:{title}}}))})});
  for(const [name,headers] of Object.entries(SHEETS)){
    if(!missing.includes(name))continue;
    await sheets('/values/'+encodeURIComponent(name+'!A1')+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[headers]})});
  }
  bootstrapped=true;
}
async function rows(name){
  await ensureSheets();
  const result=await sheets('/values/'+encodeURIComponent(name+'!A:Z'));
  const headers=SHEETS[name];
  return (result.values||[]).slice(1).map((r,i)=>({...Object.fromEntries(headers.map((key,j)=>[key,r[j]||''])),_row:i+2}));
}
async function append(name,item){
  await ensureSheets();
  await sheets('/values/'+encodeURIComponent(name+'!A:Z')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:[SHEETS[name].map(key=>item[key]||'')]})});
}
async function update(name,row,col,value){
  const letter=String.fromCharCode(65+SHEETS[name].indexOf(col));
  await sheets('/values/'+encodeURIComponent(name+'!'+letter+row)+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[[value]]})});
}
async function lineUser(req){
  const token=(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];
  if(!token) return null;
  const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:token,client_id:env().channelId})});
  if(!response.ok)return null;
  const data=await response.json();
  return data.sub || null;
}
function valid(kind,data){
  const fields=maps[kind],result={};
  for(const [key,max] of Object.entries(fields)){
    const value=String(data?.[key]??'').trim();
    if(!value||value.length>max)throw new Error('欄位錯誤：'+key);
    result[key]=value;
  }
  if(result.phone && !/^[0-9+() -]{8,20}$/.test(result.phone))throw new Error('電話格式錯誤');
  if(result.date && (!/^\d{4}-\d{2}-\d{2}$/.test(result.date)||result.date<today()))throw new Error('日期必須是今天或未來');
  if(result.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result.time))throw new Error('時間格式錯誤');
  if(result.people && (+result.people<1||+result.people>1000))throw new Error('人數超出範圍');
  if(result.buses && (+result.buses<0||+result.buses>100))throw new Error('車輛數超出範圍');
  return result;
}
function cors(req,res){
  const configured=process.env.ALLOWED_ORIGIN;
  const origin=req.headers.origin;
  if(origin && configured && origin===configured){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
  res.setHeader('Cache-Control','no-store');
}
const send=(res,code,data)=>res.status(code).json(data);
export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  const url=new URL(req.url,'https://local.invalid');
  const path=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean);
  try{
    if(path[0]==='health'&&req.method==='GET')return send(res,200,{ready:!!(process.env.GOOGLE_SHEET_ID&&process.env.GOOGLE_SERVICE_ACCOUNT_JSON&&process.env.LINE_CHANNEL_ID)});
    env();
    if(path[0]==='queue'&&req.method==='GET'){
      const all=(await rows('appointments')).filter(a=>a.temple_id===templeId&&a.date===today()&&a.status!=='已取消');
      const setting=(await rows('settings')).find(x=>x.key==='queue_'+templeId+'_'+today());
      return send(res,200,{total:all.length,current:setting?.value?.slice(0,8)||'—'});
    }
    const user=await lineUser(req);
    if(!user)return send(res,401,{error:'請先使用 LINE 登入'});
    const admin=(process.env.ADMIN_LINE_USER_IDS||'').split(',').map(x=>x.trim()).includes(user);
    if(path[0]==='me'&&req.method==='GET')return send(res,200,{admin});
    if(path[0]==='records'&&path[1]&&maps[path[1]]&&req.method==='POST'){
      const kind=path[1],fields=valid(kind,req.body);
      const record={...fields,id:randomUUID(),temple_id:templeId,line_user_id:user,status:'待確認',created_at:new Date().toISOString()};
      await append(kind,record);
      return send(res,201,{id:record.id,status:record.status});
    }
    if(path[0]==='mine'&&req.method==='GET'){
      const all=await Promise.all(Object.keys(maps).map(async kind=>(await rows(kind)).filter(x=>x.temple_id===templeId&&x.line_user_id===user).map(({_row,line_user_id,phone,...x})=>({...x,kind}))));
      return send(res,200,{records:all.flat().sort((a,b)=>b.created_at.localeCompare(a.created_at))});
    }
    if(path[0]==='admin'&&!admin)return send(res,403,{error:'管理員權限不足'});
    if(path[0]==='admin'&&path[1]==='records'&&req.method==='GET'){
      const all=await Promise.all(Object.keys(maps).map(async kind=>(await rows(kind)).filter(x=>x.temple_id===templeId).map(x=>({...x,kind}))));
      return send(res,200,{records:all.flat().sort((a,b)=>b.created_at.localeCompare(a.created_at))});
    }
    if(path[0]==='admin'&&path[1]==='records'&&path[2]&&path[3]&&req.method==='PATCH'){
      const kind=path[2];
      if(!maps[kind]||!allowedStatus.includes(req.body?.status))throw new Error('狀態不正確');
      const record=(await rows(kind)).find(x=>x.id===path[3]&&x.temple_id===templeId);
      if(!record)return send(res,404,{error:'找不到紀錄'});
      await update(kind,record._row,'status',req.body.status);
      return send(res,200,{ok:true});
    }
    if(path[0]==='admin'&&path[1]==='import'&&req.method==='POST'){
      const changes=req.body?.changes;
      if(!Array.isArray(changes)||changes.length<1||changes.length>100)throw new Error('匯入筆數不正確');
      const keys=new Set();
      for(const change of changes){
        if(!maps[change.kind]||typeof change.id!=='string'||!allowedStatus.includes(change.status))throw new Error('匯入欄位不正確');
        const key=change.kind+':'+change.id;
        if(keys.has(key))throw new Error('匯入檔含重複編號');
        keys.add(key);
      }
      const grouped=Object.fromEntries(await Promise.all(Object.keys(maps).map(async kind=>[kind,await rows(kind)])));
      const updates=changes.map(change=>{
        const record=grouped[change.kind].find(x=>x.id===change.id&&x.temple_id===templeId);
        if(!record)throw new Error('匯入檔含不存在的編號');
        return {kind:change.kind,row:record._row,status:change.status};
      });
      for(const item of updates)await update(item.kind,item.row,'status',item.status);
      return send(res,200,{updated:updates.length});
    }
    if(path[0]==='admin'&&path[1]==='queue'&&req.method==='POST'){
      const all=(await rows('appointments')).filter(x=>x.temple_id===templeId&&x.date===today()&&x.status!=='已取消').sort((a,b)=>a.created_at.localeCompare(b.created_at));
      const key='queue_'+templeId+'_'+today();
      const setting=(await rows('settings')).find(x=>x.key===key);
      const next=setting?all.findIndex(x=>x.id===setting.value)+1:0;
      const record=all[next];
      if(!record)return send(res,404,{error:'今天沒有下一筆預約'});
      if(setting)await update('settings',setting._row,'value',record.id);
      else await append('settings',{key,value:record.id});
      return send(res,200,{current:record.id.slice(0,8)});
    }
    return send(res,404,{error:'找不到 API'});
  }catch(error){
    const bad=/欄位錯誤|格式錯誤|超出範圍|日期必須|狀態不正確|匯入/.test(error.message);
    console.error(error);
    return send(res,bad?400:503,{error:bad?error.message:'服務暫時無法使用，請稍後再試'});
  }
}
