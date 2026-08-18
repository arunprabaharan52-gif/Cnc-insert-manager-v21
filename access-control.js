(function(){
  'use strict';
  const config=globalThis.CNC_ACCESS_CONFIG||{defaultHashes:{},sessionHours:12};
  const SESSION_PREFIX='cnc_role_session_v3_';
  const HASH_PREFIX='cnc_role_hash_v3_';

  function roleName(role){return role==='admin'?'Admin':'Operator'}
  function sessionKey(role){return SESSION_PREFIX+role}
  function hashKey(role){return HASH_PREFIX+role}
  function setAuthorized(role){sessionStorage.setItem(sessionKey(role),JSON.stringify({role,expires:Date.now()+(+config.sessionHours||12)*3600000}))}
  function isAuthorized(role){
    try{const s=JSON.parse(sessionStorage.getItem(sessionKey(role))||'null');if(s&&s.role===role&&s.expires>Date.now())return true}
    catch(e){}
    sessionStorage.removeItem(sessionKey(role));return false
  }
  async function sha256(value){
    const bytes=new TextEncoder().encode(String(value));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
  }
  function database(){
    try{
      if(!globalThis.firebase||!globalThis.FIREBASE_CONFIG?.apiKey)return null;
      if(!firebase.apps.length)firebase.initializeApp(globalThis.FIREBASE_CONFIG);
      return firebase.database()
    }catch(e){console.warn('Access database unavailable',e);return null}
  }
  async function cloudHash(role){
    const db=database();if(!db)return '';
    try{
      const read=db.ref('cncManager/settings/accessHashes/'+role).once('value');
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),5000));
      const snap=await Promise.race([read,timeout]);return snap.exists()?String(snap.val()||''):''
    }catch(e){return ''}
  }
  async function currentHash(role){
    const remote=await cloudHash(role);
    if(remote){localStorage.setItem(hashKey(role),remote);return remote}
    return localStorage.getItem(hashKey(role))||config.defaultHashes?.[role]||''
  }
  async function verify(role,password){const expected=await currentHash(role);return !!expected&&(await sha256(password))===expected}
  async function writeHash(role,hash){
    const db=database();if(!db)throw new Error('Firebase connection இல்லை. இணைய இணைப்புடன் மீண்டும் முயற்சி செய்யவும்.');
    await db.ref('cncManager/settings/accessHashes/'+role).set(hash);localStorage.setItem(hashKey(role),hash)
  }
  function injectStyles(){
    if(document.getElementById('cncAccessStyles'))return;
    const s=document.createElement('style');s.id='cncAccessStyles';s.textContent=`
      body.cnc-access-locked>*:not(#cncAccessGate){display:none!important}
      #cncAccessGate,.cnc-password-modal{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:linear-gradient(145deg,#0f2940,#174c70 55%,#0f6b70);font-family:Arial,"Noto Sans Tamil",sans-serif;color:#17212b;overflow:auto}
      #cncAccessGate *,.cnc-password-modal *{box-sizing:border-box}.cnc-login-card,.cnc-password-card{width:min(430px,100%);background:#fff;border-radius:18px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.35)}
      .cnc-login-card h1,.cnc-password-card h2{margin:8px 0}.cnc-login-card label,.cnc-password-card label{display:block;margin:12px 0 5px;color:#475569;font-size:13px}.cnc-login-card input,.cnc-password-card input{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}
      .cnc-login-card button,.cnc-password-card button{border:0;border-radius:10px;padding:11px 14px;font:inherit;cursor:pointer}.cnc-login-card button[type=submit],.cnc-password-card button[type=submit]{width:100%;margin-top:14px;background:#087f5b;color:#fff;font-weight:700}
      .cnc-role-pill{display:inline-block;padding:5px 9px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px;font-weight:700}.cnc-login-mark{font-size:34px}.cnc-login-subtitle,.cnc-login-note{color:#64748b}.cnc-login-status{min-height:22px;margin-top:10px;color:#b42318;font-weight:700}.cnc-password-actions{display:flex;gap:8px;margin-top:10px}.cnc-password-actions button{flex:1}.cnc-password-cancel{background:#e8eef5}
    `;document.head.appendChild(s)
  }
  function guard(role){
    injectStyles();if(isAuthorized(role))return;
    const mount=()=>{
      document.body.classList.add('cnc-access-locked');
      const gate=document.createElement('div');gate.id='cncAccessGate';gate.innerHTML=`<form class="cnc-login-card" autocomplete="on"><div class="cnc-login-mark">🔒</div><span class="cnc-role-pill">${roleName(role)} Access</span><h1>CNC ${roleName(role)} Login</h1><p class="cnc-login-subtitle">${role==='admin'?'Dashboard, reports, masters and settings':'Daily operator entry only'}</p><label for="cncPassword">Password</label><input id="cncPassword" type="password" autocomplete="current-password" required placeholder="Password உள்ளிடவும்"><button type="submit">Login</button><div class="cnc-login-status" role="alert" aria-live="polite"></div><p class="cnc-login-note">சரியான role password கொடுத்தால் மட்டுமே இந்தப் பக்கம் திறக்கும்.</p></form>`;
      document.body.appendChild(gate);const form=gate.querySelector('form'),status=gate.querySelector('.cnc-login-status'),button=form.querySelector('button[type=submit]');
      form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;button.textContent='Checking...';status.textContent='';try{if(await verify(role,form.querySelector('#cncPassword').value)){setAuthorized(role);location.reload()}else status.textContent='Password தவறு. மீண்டும் சரிபார்க்கவும்.'}catch(err){status.textContent='Login check முடியவில்லை: '+err.message}finally{button.disabled=false;button.textContent='Login'}})
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount()
  }
  function logout(role){sessionStorage.removeItem(sessionKey(role));location.reload()}
  function openPasswordDialog(targetRole,verifierRole=targetRole){
    injectStyles();if(!isAuthorized(verifierRole))return alert('முதலில் மீண்டும் login செய்யவும்.');
    const modal=document.createElement('div');modal.className='cnc-password-modal';const verifierLabel=verifierRole==='admin'?'Admin Current Password':'Current Password';
    modal.innerHTML=`<form class="cnc-password-card"><span class="cnc-role-pill">${roleName(targetRole)}</span><h2>Change ${roleName(targetRole)} Password</h2><label>${verifierLabel}</label><input name="current" type="password" autocomplete="current-password" required><label>New Password</label><input name="next" type="password" autocomplete="new-password" minlength="8" required><label>Confirm New Password</label><input name="confirm" type="password" autocomplete="new-password" minlength="8" required><div class="cnc-login-status" role="alert"></div><button type="submit">Save New Password</button><div class="cnc-password-actions"><button class="cnc-password-cancel" type="button">Cancel</button></div></form>`;
    document.body.appendChild(modal);const form=modal.querySelector('form'),status=modal.querySelector('.cnc-login-status'),save=form.querySelector('button[type=submit]');modal.querySelector('.cnc-password-cancel').onclick=()=>modal.remove();
    form.addEventListener('submit',async e=>{e.preventDefault();const data=new FormData(form),current=data.get('current'),next=String(data.get('next')||''),confirm=String(data.get('confirm')||'');if(next.length<8)return status.textContent='New password குறைந்தது 8 characters இருக்க வேண்டும்.';if(next!==confirm)return status.textContent='New password இரண்டும் ஒன்றாக இல்லை.';save.disabled=true;save.textContent='Saving...';status.textContent='';try{if(!await verify(verifierRole,current))return status.textContent=verifierLabel+' தவறு.';await writeHash(targetRole,await sha256(next));if(targetRole===verifierRole)setAuthorized(targetRole);alert(roleName(targetRole)+' password வெற்றிகரமாக மாற்றப்பட்டது.');modal.remove()}catch(err){status.textContent='Password save முடியவில்லை: '+err.message}finally{save.disabled=false;save.textContent='Save New Password'}})
  }
  globalThis.CNCAuth={guard,isAuthorized,verify,logout,openPasswordDialog};
})();
