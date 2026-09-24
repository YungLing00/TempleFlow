(() => {
  'use strict';
  const LIFF_ID='2011717805-j1WLn24W';
  const BASE=(window.TEMPLEFLOW_API_BASE||'').replace(/\/$/,'');
  const DIRECT=(window.TEMPLEFLOW_APPS_SCRIPT_URL||'').trim();
  const $=s=>document.querySelector(s);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token='', admin=false, ready=false;
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  document.querySelectorAll('input[type="date"]').forEach(x=>x.min=today());
  function go(tab) {
    document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===tab));
    document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
    window.scrollTo({top:0,behavior:'smooth'});
    if(tab==='queue')loadQueue();
    if(tab==='admin'&&admin)loadAdmin();
    if(tab==='mine')loadMine();
    if(tab==='parade')loadParade();
    if(tab==='fortune')loadFortunes();
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.tab)));
  async function api(path,opts={}){
    const r=await fetch(BASE+'/api/'+path,{...opts,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...opts.headers}});
    let body={};
    try{body=await r.json()}catch{throw Error('後端尚未部署或無法連線')}
    if(!r.ok)throw Error(body.error||'服務暫時無法使用');
    return body;
  }
  function directGet(action,requestId,timeout=8000){
    return new Promise((resolve,reject)=>{
      const callback='templeflow_cb_'+crypto.randomUUID().replace(/-/g,'');
      const script=document.createElement('script');
      const timer=setTimeout(()=>done(Error('Apps Script 回應逾時')),timeout);
      function done(error,data){
        clearTimeout(timer);script.remove();delete window[callback];
        error?reject(error):resolve(data);
      }
      window[callback]=data=>done(null,data);
      script.onerror=()=>done(Error('Apps Script 無法連線，請檢查部署存取權'));
      const url=new URL(DIRECT);
      url.searchParams.set('action',action);
      url.searchParams.set('callback',callback);
      if(requestId)url.searchParams.set('requestId',requestId);
      script.src=url.href;
      document.head.append(script);
    });
  }
  async function directAction(action,details={}){
    const requestId=crypto.randomUUID();
    // Apps Script 不提供跨網域 JSON 回應；POST 後用隨機收據 ID 查詢最終寫入結果。
    fetch(DIRECT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,requestId,idToken:token,...details})}).catch(()=>{});
    for(let attempt=0;attempt<30;attempt++){
      await new Promise(resolve=>setTimeout(resolve,1000));
      let receipt;
      try{receipt=await directGet('receipt',requestId,5000)}catch{continue}
      if(!receipt.pending){
        if(!receipt.ok)throw Error(receipt.error||'表單寫入失敗');
        return receipt;
      }
    }
    throw Error('未取得寫入確認，請勿重複送出；可稍後查看試算表');
  }
  const directSubmit=(kind,data)=>directAction('submit',{kind,data});
  async function init(){
    const status=$('#lineStatus');
    document.querySelectorAll('form button[type="submit"]').forEach(x=>x.disabled=true);
    try{ready=DIRECT?(await directGet('health')).ready:(await api('health')).ready}catch{ready=false}
    if(!ready){
      status.textContent='表單後端尚未啟用';
      $('#serviceNotice').textContent='線上登記目前暫停收件。服務啟用前，表單不會送出資料；乞龜與定位也不會提供即時資料。';
    }else{
      document.querySelectorAll('form button[type="submit"]').forEach(x=>x.disabled=false);
      $('#serviceNotice').textContent='Apps Script 已連線；此站為測試版本，正式宮廟服務以廟方公告為準。';
    }
    if(!window.liff){status.textContent=ready?'LINE SDK 無法載入':'後端尚未啟用';return}
    try{
      await liff.init({liffId:LIFF_ID});
      $('#lineLogin').addEventListener('click',()=>liff.login({redirectUri:location.origin+location.pathname}));
      $('#lineLogout').addEventListener('click',()=>{liff.logout();location.reload()});
      if(!liff.isLoggedIn()){
        $('#lineLogin').classList.remove('hidden');
        if(ready)status.textContent='請使用 LINE 登入';
        return;
      }
      token=liff.getIDToken();
      if(!token)throw Error('缺少 LINE ID token，請確認 openid 權限');
      if(!DIRECT){
        const me=await api('me');
        admin=me.admin;
      }
      else if(ready){
        try{admin=(await directAction('adminCheck')).admin===true}catch{admin=false}
        $('#paradeAdmin').classList.toggle('hidden',!admin);
        $('#turtleAdmin').classList.toggle('hidden',!admin);
      }
      const profile=await liff.getProfile();
      status.textContent='LINE 已登入：'+profile.displayName+(ready?'':' · 後端尚未啟用');
      $('#lineLogout').classList.remove('hidden');
      $('#adminTab').classList.toggle('hidden',!admin||!!DIRECT);
      if(ready)loadMine();
    }catch(e){status.textContent='LINE 登入或後端驗證失敗';$('#serviceNotice').textContent=e.message;console.error(e)}
  }
  const forms={appointmentForm:'appointments',lightForm:'lights',volunteerForm:'volunteers',pilgrimageForm:'pilgrimages',turtleForm:'turtles'};
  for(const [id,kind] of Object.entries(forms)){
    const form=$('#'+id);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const result=form.querySelector('.result');
      if(!ready){result.textContent='後端尚未啟用，資料沒有送出';return}
      if(!token){result.textContent='請先使用 LINE 登入';return}
      const button=form.querySelector('button[type="submit"]');
      button.disabled=true;result.textContent='送出中…';
      try{
        const data=Object.fromEntries(new FormData(form));
        const saved=DIRECT?await directSubmit(kind,data):await api('records/'+kind,{method:'POST',body:JSON.stringify(data)});
        result.textContent='已收到申請，完整編號 '+saved.id+'。狀態：待確認。'+(kind==='lights'?'付款方式：LINE Pay，目前未付款；尚未開放支付。':'')+(kind==='turtles'?' 請保留編號，供日後查詢及回報還願。':'');
        if(DIRECT){
          const receipts=JSON.parse(localStorage.getItem('templeflow-receipts')||'[]');
          receipts.unshift({id:saved.id,kind,createdAt:new Date().toISOString()});
          localStorage.setItem('templeflow-receipts',JSON.stringify(receipts.slice(0,30)));
        }
        form.reset();loadMine();
      }catch(err){result.textContent='送出失敗：'+err.message}
      finally{button.disabled=false}
    });
  }
  const names={appointments:'問事',lights:'點燈',volunteers:'志工',pilgrimages:'進香',turtles:'乞龜'};
  async function loadMine(){
    const target=$('#myRecords');
    if(!target)return;
    if(DIRECT){
      const receipts=JSON.parse(localStorage.getItem('templeflow-receipts')||'[]');
      target.innerHTML=receipts.length?receipts.map(x=>'<div class="card"><strong>'+escape(names[x.kind]||x.kind)+' · '+escape(x.id)+'</strong><p>本裝置的申請收據 · 待廟方確認</p>'+(x.kind==='turtles'?'<button class="btn alt" type="button" data-turtle-id="'+escape(x.id)+'">查詢還願進度</button>':'')+'</div>').join(''):'這台裝置目前沒有申請收據';
      return;
    }
    if(!ready||!token){target.textContent='完成後端設定並以 LINE 登入後，可查看自己的申請。';return}
    try{
      const {records}=await api('mine');
      target.innerHTML=records.length?records.map(x=>'<div class="card"><strong>'+escape(names[x.kind])+' · '+escape(x.id.slice(0,8))+'</strong><p>'+escape(x.date||x.type||'')+' · '+escape(x.status)+(x.kind==='lights'?' · '+escape(x.payment_method||'LINE Pay')+' '+escape(x.payment_status||'未付款'):'')+'</p></div>').join(''):'尚無申請紀錄';
    }catch(e){target.textContent=e.message}
  }
  async function loadQueue(){
    if(DIRECT){$('#currentNumber').textContent='尚未開放';return}
    if(!ready)return;
    try{
      const q=await api('queue');
      $('#todayCount').textContent=q.total;
      $('#currentNumber').textContent=q.current;
    }catch(e){$('#currentNumber').textContent='無法取得'}
  }
  let records=[];
  async function loadAdmin(){
    if(!admin)return;
    try{
      ({records}=await api('admin/records'));
      for(const [kind,id] of [['appointments','appointmentCount'],['lights','lightCount'],['volunteers','volunteerCount'],['pilgrimages','pilgrimageCount']])$('#'+id).textContent=records.filter(x=>x.kind===kind).length;
      $('#records').innerHTML=records.length?records.slice(0,100).map(x=>'<tr><td>'+escape(names[x.kind])+'</td><td>'+escape(x.id.slice(0,8))+'</td><td>'+escape(x.name||x.group)+'</td><td>'+escape(x.date||x.type||'')+'</td><td><select aria-label="更新狀態" data-kind="'+escape(x.kind)+'" data-id="'+escape(x.id)+'">'+['待確認','已確認','已取消','已完成'].map(s=>'<option '+(x.status===s?'selected':'')+'>'+s+'</option>').join('')+'</select></td></tr>').join(''):'<tr><td colspan="5">目前沒有紀錄</td></tr>';
      $('#adminMessage').textContent='資料已更新';
    }catch(e){$('#adminMessage').textContent=e.message}
  }
  $('#records').addEventListener('change',async e=>{
    const select=e.target.closest('select[data-id]');
    if(!select)return;
    try{await api('admin/records/'+select.dataset.kind+'/'+encodeURIComponent(select.dataset.id),{method:'PATCH',body:JSON.stringify({status:select.value})});loadAdmin()}catch(err){$('#adminMessage').textContent=err.message;loadAdmin()}
  });
  $('#nextQueue').addEventListener('click',async()=>{
    try{const result=await api('admin/queue',{method:'POST',body:'{}'});$('#adminMessage').textContent='已叫號 '+result.current;loadQueue()}catch(e){$('#adminMessage').textContent=e.message}
  });
  function cell(v){let s=String(v??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
  $('#exportData').addEventListener('click',()=>{
    if(!admin)return;
    const lines=[['服務','編號','姓名／團體','電話','日期','類型／時段','狀態','付款方式','付款狀態'],...records.map(x=>[names[x.kind],x.id,x.name||x.group,x.phone,x.date,x.type||x.slot||x.role||x.time,x.status,x.payment_method||'',x.payment_status||''])];
    const blob=new Blob(['\ufeff'+lines.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='TempleFlow-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  function parseCSV(input){
    const output=[];let row=[],value='',quoted=false;
    for(let i=0;i<input.length;i++){
      const c=input[i];
      if(c==='"'){
        if(quoted&&input[i+1]==='"'){value+='"';i++}
        else quoted=!quoted;
      }else if(c===','&&!quoted){row.push(value);value=''}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(value);if(row.some(Boolean))output.push(row);row=[];value=''}
      else value+=c;
    }
    if(quoted)throw Error('CSV 引號未關閉');
    row.push(value);if(row.some(Boolean))output.push(row);
    return output;
  }
  $('#importData').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file||!admin)return;
    try{
      if(file.size>200000)throw Error('檔案超過 200 KB');
      const rows=parseCSV((await file.text()).replace(/^\ufeff/,''));
      if(!['服務,編號,姓名／團體,電話,日期,類型／時段,狀態','服務,編號,姓名／團體,電話,日期,類型／時段,狀態,付款方式,付款狀態'].includes(rows[0]?.join(',')))throw Error('請使用網站匯出的 CSV 格式');
      const reverse={問事:'appointments',點燈:'lights',志工:'volunteers',進香:'pilgrimages'};
      const changes=rows.slice(1).map(row=>({kind:reverse[row[0]],id:row[1],status:row[6]}));
      if(!changes.length)throw Error('檔案內沒有紀錄');
      if(!confirm('要更新 '+changes.length+' 筆資料的狀態嗎？姓名、電話等欄位不會被匯入。'))return;
      const result=await api('admin/import',{method:'POST',body:JSON.stringify({changes})});
      $('#adminMessage').textContent='已更新 '+result.updated+' 筆狀態';loadAdmin();
    }catch(err){$('#adminMessage').textContent='匯入失敗：'+err.message}
    finally{e.target.value=''}
  });
  let fortunes=null,chosenFortune=null,fortuneAiReady=false,fortuneAiChecked=false;
  function renderFortune(){
    $('#fortuneNumber').textContent='第 '+chosenFortune.number+' 籤 · 原創示範';
    $('#fortuneTitle').textContent=chosenFortune.title;
    $('#fortunePoem').textContent=chosenFortune.poem;
    $('#fortuneMeaning').textContent='白話提醒：'+chosenFortune.meaning;
    $('#fortuneSlip').classList.remove('hidden');
    $('#fortuneForm').classList.remove('hidden');
    $('#redrawFortune').classList.remove('hidden');
    $('#fortuneAnswer').classList.add('hidden');
    $('#fortuneAnswer').textContent='';
    $('#fortuneQuestion').value='';
    $('#fortuneConsent').checked=false;
    $('#fortuneAiStatus').textContent=fortuneAiReady?'可登入 LINE 後選擇 AI 解籤；每個帳號每小時最多五次。':'AI 解籤尚未設定；目前可閱讀籤詩與白話提醒。';
    $('#fortuneStatus').textContent='已抽得第 '+chosenFortune.number+' 籤。';
  }
  async function loadFortunes(){
    if(fortunes){
      if(DIRECT&&ready&&!fortuneAiChecked){
        try{fortuneAiReady=(await directGet('fortune_config')).aiReady===true}catch{}
        fortuneAiChecked=true;
        if(chosenFortune)$('#fortuneAiStatus').textContent=fortuneAiReady?'可登入 LINE 後選擇 AI 解籤；每個帳號每小時最多五次。':'AI 解籤尚未設定；目前可閱讀籤詩與白話提醒。';
      }
      return;
    }
    $('#fortuneStatus').textContent='正在準備籤詩…';
    try{
      const response=await fetch('./fortunes.json');
      if(!response.ok)throw Error('籤詩資料暫時無法載入');
      const data=await response.json();
      if(!Array.isArray(data)||!data.length)throw Error('籤詩資料不完整');
      fortunes=data;
      $('#fortuneStatus').textContent='靜心後，按下「誠心抽一支籤」。';
      if(DIRECT&&ready){
        try{fortuneAiReady=(await directGet('fortune_config')).aiReady===true}catch{fortuneAiReady=false}
        fortuneAiChecked=true;
      }
      const remembered=Number(sessionStorage.getItem('templeflow-fortune'));
      chosenFortune=fortunes.find(item=>item.number===remembered)||null;
      if(chosenFortune)renderFortune();
    }catch(e){$('#fortuneStatus').textContent=e.message}
  }
  async function drawFortune(){
    await loadFortunes();
    if(!fortunes)return;
    const pool=fortunes.length>1?fortunes.filter(item=>item.number!==chosenFortune?.number):fortunes;
    const array=new Uint32Array(1);crypto.getRandomValues(array);
    chosenFortune=pool[array[0]%pool.length];
    sessionStorage.setItem('templeflow-fortune',String(chosenFortune.number));
    renderFortune();
  }
  $('#drawFortune').addEventListener('click',drawFortune);
  $('#redrawFortune').addEventListener('click',drawFortune);
  $('#fortuneForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const status=$('#fortuneAiStatus'),button=$('#interpretFortune');
    if(!chosenFortune)return;
    if(!ready||!DIRECT||!fortuneAiReady){status.textContent='AI 解籤尚未啟用；仍可閱讀上方籤詩與白話提醒。';return}
    if(!token){status.textContent='請先使用 LINE 登入，再回到這支籤。';$('#lineLogin').classList.remove('hidden');return}
    button.disabled=true;status.textContent='正在解讀籤詩…';
    $('#fortuneAnswer').classList.add('hidden');
    try{
      const result=await directAction('interpretFortune',{
        number:chosenFortune.number,topic:$('#fortuneTopic').value,
        question:$('#fortuneQuestion').value.trim(),consent:$('#fortuneConsent').checked
      });
      $('#fortuneAnswer').textContent=result.interpretation;
      $('#fortuneAnswer').classList.remove('hidden');
      status.textContent='AI 解籤完成。這是參考解讀，請自行判斷。';
    }catch(err){status.textContent='AI 解籤失敗：'+err.message}
    finally{button.disabled=false}
  });
  async function turtleTrack(report=false){
    const target=$('#turtleResult'),id=$('#turtleId').value.trim();
    if(!ready||!DIRECT){target.textContent='乞龜查詢服務尚未啟用';return}
    if(!token){target.textContent='請先使用原申請的 LINE 帳號登入';return}
    if(!id){target.textContent='請輸入完整申請編號';return}
    target.textContent=report?'正在回報還願…':'正在查詢…';
    try{
      if(report&&!confirm('確定已完成還願，並向廟方提交回報？')){target.textContent='已取消';return}
      const data=await directAction(report?'reportFulfillment':'turtleStatus',{id});
      target.textContent='申請 '+data.id+'：'+data.status+'；還願：'+data.fulfillmentStatus+'。';
    }catch(e){target.textContent='查詢失敗：'+e.message}
  }
  $('#turtleTrackForm').addEventListener('submit',e=>{e.preventDefault();turtleTrack()});
  $('#reportFulfillment').addEventListener('click',()=>turtleTrack(true));
  $('#approveFulfillment').addEventListener('click',async()=>{
    if(!admin||!ready||!DIRECT)return;
    const id=$('#turtleAdminId').value.trim(),target=$('#turtleAdminResult');
    if(!id){target.textContent='請輸入完整申請編號';return}
    if(!confirm('已現場核對還願完成，確認更新這筆紀錄？'))return;
    target.textContent='確認中…';
    try{
      const result=await directAction('approveFulfillment',{id});
      target.textContent='申請 '+result.id+'：'+result.fulfillmentStatus;
    }catch(e){target.textContent='確認失敗：'+e.message}
  });
  $('#myRecords').addEventListener('click',e=>{
    const button=e.target.closest('[data-turtle-id]');if(!button)return;
    $('#turtleId').value=button.dataset.turtleId;go('turtle');turtleTrack();
  });
  async function loadParade(){
    const status=$('#paradeStatus'),map=$('#paradeMap');
    map.classList.add('hidden');$('#paradeUpdated').textContent='';
    if(!ready||!DIRECT){status.textContent='定位服務尚未啟用';return}
    status.textContent='正在讀取位置…';
    try{
      const result=await directGet('location');
      if(!result.ok||!result.active){status.textContent='目前沒有公開的武轎位置';return}
      status.textContent='武轎位置已更新';
      $('#paradeUpdated').textContent='更新時間：'+new Date(result.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'});
      map.href='https://www.google.com/maps?q='+encodeURIComponent(result.lat+','+result.lng);
      map.classList.remove('hidden');
    }catch(e){status.textContent='無法取得位置：'+e.message}
  }
  $('#refreshParade').addEventListener('click',loadParade);
  let paradeWatch=null,paradeLastSent=0,paradeBusy=false,paradeStopping=false;
  async function publishPosition(position){
    if(paradeBusy||paradeStopping||Date.now()-paradeLastSent<30000)return;
    paradeBusy=true;
    try{
      await directAction('updateLocation',{lat:position.coords.latitude,lng:position.coords.longitude});
      paradeLastSent=Date.now();$('#paradeAdminStatus').textContent='分享中，上次更新：'+new Date().toLocaleTimeString('zh-TW');
      loadParade();
    }catch(e){$('#paradeAdminStatus').textContent='位置更新失敗：'+e.message}
    finally{paradeBusy=false}
  }
  $('#startParade').addEventListener('click',()=>{
    if(!admin||!ready||!DIRECT)return;
    if(!navigator.geolocation){$('#paradeAdminStatus').textContent='此裝置不支援定位';return}
    if(paradeWatch!==null)return;
    $('#paradeAdminStatus').textContent='正在取得定位權限…';
    paradeWatch=navigator.geolocation.watchPosition(publishPosition,error=>{
      $('#paradeAdminStatus').textContent='定位失敗：'+error.message;
      if(error.code===1&&paradeWatch!==null){navigator.geolocation.clearWatch(paradeWatch);paradeWatch=null}
    },{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
  });
  $('#stopParade').addEventListener('click',async()=>{
    if(!admin||!ready||!DIRECT)return;
    if(paradeWatch!==null){navigator.geolocation.clearWatch(paradeWatch);paradeWatch=null}
    paradeStopping=true;
    $('#paradeAdminStatus').textContent='正在停止分享…';
    try{
      while(paradeBusy)await new Promise(resolve=>setTimeout(resolve,250));
      await directAction('stopLocation');$('#paradeAdminStatus').textContent='已停止分享位置';loadParade();
    }
    catch(e){$('#paradeAdminStatus').textContent='停止失敗：'+e.message}
    finally{paradeStopping=false}
  });
  init();
})();
