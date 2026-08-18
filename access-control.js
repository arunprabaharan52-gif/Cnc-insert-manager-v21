(function(){
  'use strict';

  const config=window.CNC_ACCESS_CONFIG||{};
  const sessionKey='cnc_access_session_v2';
  const attemptPrefix='cnc_access_attempts_v2_';

  const style=document.createElement('style');
  style.textContent=`
    html.cnc-auth-pending body{visibility:hidden}
    body.cnc-access-locked{margin:0;background:#edf2f7!important}
    body.cnc-access-locked>*:not(#cncAccessGate){display:none!important}
    #cncAccessGate{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:linear-gradient(145deg,#0f2940,#174c70 55%,#0f6b70);font-family:Arial,"Noto Sans Tamil",sans-serif;color:#17212b;overflow:auto}
    #cncAccessGate *{box-sizing:border-box}
    .cnc-login-card{width:min(430px,100%);background:#fff;border:1px solid rgba(255,255,255,.65);border-radius:20px;padding:26px;box-shadow:0 24px 70px rgba(0,0,0,.28)}
    .cnc-login-mark{width:58px;height:58px;display:grid;place-items:center;border-radius:16px;background:#15324b;color:#fff;font-size:28px;margin-bottom:16px}
    .cnc-login-card h1{margin:0 0 6px;font-size:24px;color:#15324b}
    .cnc-login-card p{margin:0 0 18px;color:#64748b;line-height:1.45}
    .cnc-role-pill{display:inline-block;margin-bottom:16px;padding:6px 10px;border-radius:999px;background:#e5f2ff;color:#0f5f99;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    .cnc-login-card label{display:block;margin-bottom:6px;color:#475569;font-size:13px}
    .cnc-login-card input{width:100%;padding:13px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;outline:none;background:#fff;color:#17212b}
    .cnc-login-card input:focus{border-color:#0f5f99;box-shadow:0 0 0 3px rgba(15,95,153,.14)}
    .cnc-login-card button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:10px;background:#087f5b;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    .cnc-login-card button:disabled{opacity:.6;cursor:not-allowed}
    .cnc-login-status{min-height:22px;margin-top:12px;font-size:13px;color:#b42318;line-height:1.4}
    .cnc-login-note{margin-top:14px!important;margin-bottom:0!important;font-size:12px;color:#64748b!important}
    #cncLogoutButton{position:fixed;right:12px;top:12px;z-index:2147483646;border:1px solid rgba(255,255,255,.45);border-radius:9px;padding:8px 11px;background:#b42318;color:#fff;font:600 12px Arial,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18)}
    @media(max-width:560px){.cnc-login-card{padding:22px 18px}.cnc-login-card h1{font-size:21px}#cncLogoutButton{top:auto;bottom:12px}}
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add('cnc-auth-pending');

  function readJSON(storage,key){
    try{return JSON.parse(storage.getItem(key)||'null')}catch(e){return null}
  }
  function writeJSON(storage,key,value){
    try{storage.setItem(key,JSON.stringify(value));return true}catch(e){return false}
  }
  function roleConfig(role){return role==='admin'||role==='operator'?config[role]:null}
  function isAuthorized(role){
    const session=readJSON(sessionStorage,sessionKey);
    if(!session||session.role!==role||!Number.isFinite(+session.expiresAt)||Date.now()>=+session.expiresAt){
      if(session)try{sessionStorage.removeItem(sessionKey)}catch(e){}
      return false
    }
    return true
  }
  function clearSession(){try{sessionStorage.removeItem(sessionKey)}catch(e){}}
  function constantTimeEqual(a,b){
    a=String(a||'');b=String(b||'');let diff=a.length^b.length,max=Math.max(a.length,b.length);
    for(let i=0;i<max;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
    return diff===0
  }
  function hex(buffer){return [...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('')}
  async function passwordHash(password,salt){
    if(!window.crypto||!crypto.subtle)throw new Error('Secure password check is not supported in this browser. Chrome-ஐ பயன்படுத்தவும்.');
    const enc=new TextEncoder(),material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:+config.pbkdf2Iterations||120000,hash:'SHA-256'},material,256);
    return hex(bits)
  }
  function installLogout(role){
    const add=()=>{
      if(document.getElementById('cncLogoutButton'))return;
      const button=document.createElement('button');button.id='cncLogoutButton';button.type='button';button.textContent=(roleConfig(role)?.label||role)+' Logout';
      button.addEventListener('click',()=>{clearSession();location.reload()});document.body.appendChild(button)
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add,{once:true});else add()
  }
  function unlock(role){
    document.documentElement.classList.remove('cnc-auth-pending');
    if(document.body)document.body.classList.remove('cnc-access-locked');
    document.getElementById('cncAccessGate')?.remove();installLogout(role)
  }
  function attemptState(role){return readJSON(sessionStorage,attemptPrefix+role)||{count:0,lockUntil:0}}
  function saveAttemptState(role,state){writeJSON(sessionStorage,attemptPrefix+role,state)}
  function clearAttempts(role){try{sessionStorage.removeItem(attemptPrefix+role)}catch(e){}}
  function renderGate(role){
    const roleData=roleConfig(role),body=document.body;
    body.classList.add('cnc-access-locked');
    const gate=document.createElement('div');gate.id='cncAccessGate';
    gate.innerHTML=`<form class="cnc-login-card" autocomplete="on">
      <div class="cnc-login-mark">🔒</div>
      <span class="cnc-role-pill"></span>
      <h1></h1><p class="cnc-login-subtitle"></p>
      <label for="cncPassword">Password</label>
      <input id="cncPassword" type="password" autocomplete="current-password" required placeholder="Password உள்ளிடவும்">
      <button type="submit">Login</button>
      <div class="cnc-login-status" role="alert" aria-live="polite"></div>
      <p class="cnc-login-note">சரியான role password கொடுத்தால் மட்டுமே இந்தப் பக்கம் திறக்கும்.</p>
    </form>`;
    const form=gate.querySelector('form'),input=gate.querySelector('input'),button=gate.querySelector('button'),status=gate.querySelector('.cnc-login-status');
    gate.querySelector('.cnc-role-pill').textContent=(roleData?.label||role)+' Access';
    gate.querySelector('h1').textContent=roleData?.title||'CNC Login';
    gate.querySelector('.cnc-login-subtitle').textContent=roleData?.subtitle||'';
    body.appendChild(gate);document.documentElement.classList.remove('cnc-auth-pending');input.focus();

    function lockMessage(){
      const state=attemptState(role),seconds=Math.max(0,Math.ceil((+state.lockUntil-Date.now())/1000));
      if(seconds>0){input.disabled=true;button.disabled=true;status.textContent=`பல தவறான முயற்சிகள். ${seconds} விநாடிகள் கழித்து முயற்சி செய்யவும்.`;return true}
      input.disabled=false;button.disabled=false;if(state.lockUntil){state.count=0;state.lockUntil=0;saveAttemptState(role,state);status.textContent=''}return false
    }
    const timer=setInterval(()=>{if(!document.body.contains(gate)){clearInterval(timer);return}lockMessage()},1000);lockMessage();
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(lockMessage())return;
      if(!roleData?.passwordHash||!roleData?.salt){status.textContent='Access configuration missing. access-config.js சரிபார்க்கவும்.';return}
      button.disabled=true;input.disabled=true;status.style.color='#475569';status.textContent='Password checking...';
      try{
        const calculated=await passwordHash(input.value,roleData.salt);
        if(constantTimeEqual(calculated,roleData.passwordHash)){
          clearAttempts(role);writeJSON(sessionStorage,sessionKey,{role,expiresAt:Date.now()+(+config.sessionMinutes||480)*60000});
          status.style.color='#087f5b';status.textContent='Login successful. Opening...';location.reload();return
        }
        const state=attemptState(role);state.count=(+state.count||0)+1;
        if(state.count>=(+config.maxAttempts||5)){state.lockUntil=Date.now()+(+config.lockSeconds||30)*1000;state.count=0}
        saveAttemptState(role,state);input.value='';status.style.color='#b42318';status.textContent=state.lockUntil?'பல தவறான முயற்சிகள். சிறிது நேரம் காத்திருக்கவும்.':'Password தவறு. மீண்டும் முயற்சி செய்யவும்.'
      }catch(error){status.style.color='#b42318';status.textContent=error.message||'Password check failed.'}
      finally{if(!lockMessage()){input.disabled=false;button.disabled=false;input.focus()}}
    })
  }
  function guard(role){
    if(!roleConfig(role)){
      const fail=()=>{document.documentElement.classList.remove('cnc-auth-pending');document.body.textContent='Access configuration error.'};
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fail,{once:true});else fail();return
    }
    if(isAuthorized(role)){unlock(role);return}
    const show=()=>renderGate(role);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show()
  }

  window.CNCAuth=Object.freeze({guard,isAuthorized,logout:function(){clearSession();location.reload()}});
})();
