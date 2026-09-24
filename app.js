(() => {
  'use strict';
  const LIFF_ID='2011717805-j1WLn24W';
  const BASE=(window.TEMPLEFLOW_API_BASE||'').replace(/\/$/,'');
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
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.tab)));
  async function api(path,opts={}){
    const r=await fetch(BASE+'/api/'+path,{...opts,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...opts.headers}});
    let body={};
    try{body=await r.json()}catch{throw Error('後端尚未部署或無法連線')}
    if(!r.ok)throw Error(body.error||'服務暫時無法使用');
    return body;
  }
  async function init(){
    const status=$('#lineStatus');
    try{ready=(await api('health')).ready}catch{ready=false}
    if(!ready){
      status.textContent='後端尚未啟用';
      $('#serviceNotice').textContent='目前尚未完成後端設定，表單暫停收件。';
      document.querySelectorAll('form button[type="submit"]').forEach(x=>x.disabled=true);
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
      const me=await api('me');
      admin=me.admin;
      const profile=await liff.getProfile();
      status.textContent='LINE 已登入：'+profile.displayName+(ready?'':' · 後端尚未啟用');
      $('#lineLogout').classList.remove('hidden');
      $('#adminTab').classList.toggle('hidden',!admin);
      if(ready)loadMine();
    }catch(e){status.textContent='LINE 登入或後端驗證失敗';$('#serviceNotice').textContent=e.message;console.error(e)}
  }
  const forms={appointmentForm:'appointments',lightForm:'lights',volunteerForm:'volunteers',pilgrimageForm:'pilgrimages'};
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
        const saved=await api('records/'+kind,{method:'POST',body:JSON.stringify(data)});
        result.textContent='已收到申請，編號 '+saved.id.slice(0,8)+'。狀態：待確認。'+(kind==='lights'?'付款方式：LINE Pay，目前未付款；尚未開放支付。':'');
        form.reset();loadMine();
      }catch(err){result.textContent='送出失敗：'+err.message}
      finally{button.disabled=false}
    });
  }
  const names={appointments:'問事',lights:'點燈',volunteers:'志工',pilgrimages:'進香'};
  async function loadMine(){
    const target=$('#myRecords');
    if(!target)return;
    if(!ready||!token){target.textContent='完成後端設定並以 LINE 登入後，可查看自己的申請。';return}
    try{
      const {records}=await api('mine');
      target.innerHTML=records.length?records.map(x=>'<div class="card"><strong>'+escape(names[x.kind])+' · '+escape(x.id.slice(0,8))+'</strong><p>'+escape(x.date||x.type||'')+' · '+escape(x.status)+(x.kind==='lights'?' · '+escape(x.payment_method||'LINE Pay')+' '+escape(x.payment_status||'未付款'):'')+'</p></div>').join(''):'尚無申請紀錄';
    }catch(e){target.textContent=e.message}
  }
  async function loadQueue(){
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
  init();
})();
