(function () {
  'use strict';

  let authInstance = null;
  let databaseInstance = null;
  let activeProfile = null;
  let activeRole = '';
  let readyPromise = null;
  let pendingGateReason = '';
  let suppressAuthObserver = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function initFirebase() {
    if (!globalThis.firebase || !globalThis.FIREBASE_CONFIG?.apiKey) {
      throw new Error('Firebase configuration is missing.');
    }
    if (!firebase.apps.length) firebase.initializeApp(globalThis.FIREBASE_CONFIG);
    authInstance = firebase.auth();
    databaseInstance = firebase.database();
    return { auth: authInstance, db: databaseInstance };
  }

  function injectStyles() {
    if (document.getElementById('cncAuthStyles')) return;
    const style = document.createElement('style');
    style.id = 'cncAuthStyles';
    style.textContent = `
      body.cnc-auth-pending > *:not(#cncAuthRoot){display:none!important}
      #cncAuthRoot{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;overflow:auto;background:linear-gradient(145deg,#0d2235,#153f5e 55%,#0b6767);font-family:Arial,"Noto Sans Tamil",sans-serif;color:#17212b}
      #cncAuthRoot *{box-sizing:border-box}.cnc-auth-card{width:min(460px,100%);background:#fff;border-radius:20px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.38)}
      .cnc-auth-card h1{font-size:24px;margin:8px 0}.cnc-auth-card p{color:#64748b;line-height:1.45}.cnc-auth-card label{display:block;margin:11px 0 5px;color:#475569;font-size:13px}
      .cnc-auth-card input{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}.cnc-auth-card button{border:0;border-radius:10px;padding:11px 13px;font:inherit;cursor:pointer}
      .cnc-auth-main{width:100%;margin-top:14px;background:#087f5b;color:#fff;font-weight:700}.cnc-auth-google{width:100%;margin-top:8px;background:#e8eef5;color:#17212b;font-weight:700}
      .cnc-auth-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.cnc-auth-link{background:transparent;color:#0f5f99;padding:7px 2px!important;text-decoration:underline}
      .cnc-auth-status{min-height:24px;margin-top:10px;color:#b42318;font-weight:700;line-height:1.4}.cnc-auth-status.ok{color:#087f5b}.cnc-auth-pill{display:inline-block;padding:5px 9px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px;font-weight:700}
      .cnc-auth-hidden{display:none!important}.cnc-auth-loading{text-align:center;color:#fff;font-weight:700}.cnc-auth-spinner{width:34px;height:34px;margin:0 auto 12px;border:4px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:cncspin .8s linear infinite}@keyframes cncspin{to{transform:rotate(360deg)}}
      @media(max-width:480px){.cnc-auth-card{padding:19px}}
    `;
    document.head.appendChild(style);
  }

  function authRoot() {
    injectStyles();
    document.body.classList.add('cnc-auth-pending');
    let root = document.getElementById('cncAuthRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'cncAuthRoot';
      document.body.appendChild(root);
    }
    return root;
  }

  function showLoading(message = 'Secure login checking…') {
    authRoot().innerHTML = `<div class="cnc-auth-loading"><div class="cnc-auth-spinner"></div>${message}</div>`;
  }

  function friendlyError(error) {
    const code = String(error?.code || '');
    const map = {
      'auth/invalid-credential': 'Email அல்லது password தவறு.',
      'auth/user-not-found': 'இந்த email-க்கு account இல்லை.',
      'auth/wrong-password': 'Password தவறு.',
      'auth/email-already-in-use': 'இந்த email ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது.',
      'auth/weak-password': 'Password குறைந்தது 8 characters இருக்க வேண்டும்.',
      'auth/invalid-email': 'சரியான email address கொடுக்கவும்.',
      'auth/popup-closed-by-user': 'Google login window மூடப்பட்டது.',
      'auth/unauthorized-domain': 'இந்த GitHub Pages domain-ஐ Firebase Authorized domains-ல் சேர்க்க வேண்டும்.'
    };
    if (String(error?.message || '').includes('PERMISSION_DENIED')) {
      return 'Firebase Database Rules அனுமதி மறுத்தது. V37 rules deploy ஆனதா பார்க்கவும்.';
    }
    return map[code] || String(error?.message || 'Login failed.');
  }

  async function requestAccess(user, displayName) {
    await databaseInstance.ref(`cncManager/roleRequests/${user.uid}`).set({
      uid: user.uid,
      email: user.email || '',
      displayName: String(displayName || user.displayName || '').trim().slice(0, 120),
      requestedRole: 'operator',
      status: 'PENDING',
      emailVerifiedAtRequest: Boolean(user.emailVerified),
      requestedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  async function profileFor(user) {
    // Wait until Firebase Auth has a usable ID token before asking Realtime
    // Database to evaluate auth-based rules for this user.
    await user.getIdToken();
    const snapshot = await databaseInstance.ref(`cncManager/users/${user.uid}`).once('value');
    return snapshot.exists() ? snapshot.val() : null;
  }

  function normalizedRole(profile) {
    return String(profile?.role || '').trim().toLowerCase();
  }

  function hasRequiredRole(profile, requiredRole) {
    return profile?.active === true && normalizedRole(profile) === requiredRole;
  }

  function deniedReason(profile, requiredRole) {
    if (!profile) return `இந்த account-க்கு ${requiredRole} profile இல்லை.`;
    if (profile.active !== true) return 'இந்த account deactivate செய்யப்பட்டுள்ளது.';
    const assignedRole = normalizedRole(profile) || 'set செய்யப்படவில்லை';
    return `இந்த account role ${assignedRole}; ${requiredRole} access இல்லை.`;
  }

  function renderGate(requiredRole, reason = '') {
    const root = authRoot();
    const roleLabel = requiredRole === 'admin' ? 'Admin' : 'Operator';
    root.innerHTML = `<form class="cnc-auth-card" id="cncLoginForm" novalidate>
      <span class="cnc-auth-pill">${roleLabel} — Firebase Auth</span>
      <h1>CNC Insert Manager V37</h1>
      <p>${escapeHtml(reason || (requiredRole === 'admin' ? 'Admin dashboard access' : 'Operator issue, return and daily report access'))}</p>
      <div id="cncNameWrap" class="cnc-auth-hidden"><label for="cncDisplayName">Full name</label><input id="cncDisplayName" autocomplete="name" maxlength="120"></div>
      <label for="cncEmail">Email</label><input id="cncEmail" type="email" autocomplete="email" required>
      <label for="cncPassword">Password</label><input id="cncPassword" type="password" autocomplete="current-password" minlength="8" required>
      <button class="cnc-auth-main" id="cncSubmit" type="submit">Login</button>
      <button class="cnc-auth-google" id="cncGoogle" type="button">Continue with Google</button>
      <div class="cnc-auth-links">
        ${requiredRole === 'operator' ? '<button class="cnc-auth-link" id="cncToggleSignup" type="button">New operator signup</button>' : ''}
        <button class="cnc-auth-link" id="cncReset" type="button">Forgot password?</button>
      </div>
      <div class="cnc-auth-status" id="cncAuthStatus" role="alert" aria-live="polite"></div>
      <p><small>Account role is verified by Firebase Database Rules. Shared passwords are disabled.</small></p>
    </form>`;

    const form = root.querySelector('#cncLoginForm');
    const status = root.querySelector('#cncAuthStatus');
    const submit = root.querySelector('#cncSubmit');
    const nameWrap = root.querySelector('#cncNameWrap');
    const password = root.querySelector('#cncPassword');
    let signupMode = false;
    const setBusy = busy => {
      submit.disabled = busy;
      root.querySelector('#cncGoogle').disabled = busy;
      submit.textContent = busy ? 'Please wait…' : (signupMode ? 'Create access request' : 'Login');
    };
    const setStatus = (message, ok = false) => {
      status.textContent = message;
      status.classList.toggle('ok', ok);
    };

    root.querySelector('#cncToggleSignup')?.addEventListener('click', () => {
      signupMode = !signupMode;
      nameWrap.classList.toggle('cnc-auth-hidden', !signupMode);
      password.autocomplete = signupMode ? 'new-password' : 'current-password';
      root.querySelector('#cncToggleSignup').textContent = signupMode ? 'Back to login' : 'New operator signup';
      submit.textContent = signupMode ? 'Create access request' : 'Login';
      setStatus(signupMode ? 'Signup பிறகு Admin approval தேவை.' : '', true);
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const email = root.querySelector('#cncEmail').value.trim();
      const pass = password.value;
      if (!email || pass.length < 8) return setStatus('சரியான email மற்றும் குறைந்தது 8-character password கொடுக்கவும்.');
      setBusy(true); setStatus('');
      try {
        if (signupMode) {
          suppressAuthObserver = true;
          const name = root.querySelector('#cncDisplayName').value.trim();
          if (!name) throw new Error('Full name is required.');
          const credential = await authInstance.createUserWithEmailAndPassword(email, pass);
          await credential.user.updateProfile({ displayName: name });
          await credential.user.sendEmailVerification();
          await requestAccess(credential.user, name);
          pendingGateReason = 'Verification email அனுப்பப்பட்டது. Email verify செய்து Admin approval பெற்ற பிறகு login செய்யவும்.';
          await authInstance.signOut();
          suppressAuthObserver = false;
          signupMode = false;
          nameWrap.classList.add('cnc-auth-hidden');
          submit.textContent = 'Login';
          renderGate(requiredRole, pendingGateReason); pendingGateReason = '';
        } else {
          await authInstance.signInWithEmailAndPassword(email, pass);
          // onAuthStateChanged is the single source of truth for access checks.
        }
      } catch (error) {
        await authInstance.signOut().catch(() => {});
        suppressAuthObserver = false;
        setStatus(friendlyError(error));
      } finally {
        setBusy(false);
      }
    });

    root.querySelector('#cncGoogle').addEventListener('click', async () => {
      setBusy(true); setStatus('');
      try {
        const credential = await authInstance.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        await credential.user.getIdToken();
        // The auth observer below completes the role check. Reading the
        // database here caused a race between popup completion and Auth state.
      } catch (error) {
        await authInstance.signOut().catch(() => {});
        setStatus(friendlyError(error));
      } finally {
        setBusy(false);
      }
    });

    root.querySelector('#cncReset').addEventListener('click', async () => {
      const email = root.querySelector('#cncEmail').value.trim();
      if (!email) return setStatus('Password reset-க்கு email முதலில் கொடுக்கவும்.');
      try {
        await authInstance.sendPasswordResetEmail(email);
        setStatus('Password reset email அனுப்பப்பட்டது.', true);
      } catch (error) {
        setStatus(friendlyError(error));
      }
    });
  }

  function requireRole(requiredRole, onReady) {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve, reject) => {
      const start = () => {
        showLoading();
        try { initFirebase(); }
        catch (error) { renderGate(requiredRole, friendlyError(error)); reject(error); return; }
        authInstance.onAuthStateChanged(async user => {
          if (suppressAuthObserver) return;
          if (!user) {
            activeProfile = null; activeRole = '';
            const reason = pendingGateReason; pendingGateReason = '';
            renderGate(requiredRole, reason);
            return;
          }
          showLoading('Role and account status checking…');
          try {
            const profile = await profileFor(user);
            if (!hasRequiredRole(profile, requiredRole)) {
              const requestSnapshot = await databaseInstance.ref(`cncManager/roleRequests/${user.uid}`).once('value').catch(() => null);
              let pending = requestSnapshot?.val()?.status === 'PENDING';
              const signedInWithGoogle = user.providerData.some(item => item.providerId === 'google.com');
              if (!profile && requiredRole === 'operator' && signedInWithGoogle && !requestSnapshot?.exists()) {
                await requestAccess(user, user.displayName);
                pending = true;
              }
              pendingGateReason = pending ? 'உங்கள் access request இன்னும் Admin approval-ல் உள்ளது.' : deniedReason(profile, requiredRole);
              await authInstance.signOut();
              return;
            }
            if (!user.emailVerified && user.providerData.some(item => item.providerId === 'password')) {
              await user.sendEmailVerification().catch(() => {});
              pendingGateReason = 'Email verify செய்யப்படவில்லை. புதிய verification email அனுப்பப்பட்டுள்ளது.';
              await authInstance.signOut();
              return;
            }
            await user.getIdToken(true).catch(error => console.warn('Role-claim token refresh skipped', error));
            activeProfile = profile;
            activeRole = normalizedRole(profile);
            document.getElementById('cncAuthRoot')?.remove();
            document.body.classList.remove('cnc-auth-pending');
            await onReady({ user, profile, auth: authInstance, db: databaseInstance });
            const baselineProfile = JSON.stringify(profile);
            databaseInstance.ref(`cncManager/users/${user.uid}`).on('value', async snapshot => {
              const current = snapshot.val();
              if (!hasRequiredRole(current, requiredRole)) {
                pendingGateReason = 'இந்த account deactivate செய்யப்பட்டது அல்லது role மாற்றப்பட்டது.';
                await authInstance.signOut().catch(() => {}); location.reload(); return;
              }
              if (JSON.stringify(current) !== baselineProfile) location.reload();
            });
            resolve({ user, profile, auth: authInstance, db: databaseInstance });
          } catch (error) {
            console.error(error);
            pendingGateReason = friendlyError(error);
            await authInstance.signOut().catch(() => {});
            reject(error);
          }
        });
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
      else start();
    });
    return readyPromise;
  }

  async function logout() {
    if (!authInstance) initFirebase();
    activeProfile = null; activeRole = '';
    localStorage.removeItem('cnc_v31_sensitive_cache');
    localStorage.removeItem('cnc_v32_sensitive_cache');
    await authInstance.signOut();
    location.reload();
  }

  async function sendPasswordReset() {
    if (!authInstance) initFirebase();
    const email = authInstance.currentUser?.email;
    if (!email) throw new Error('Signed-in email is missing.');
    await authInstance.sendPasswordResetEmail(email);
    return email;
  }

  globalThis.CNCAuth = {
    requireRole,
    logout,
    sendPasswordReset,
    currentProfile: () => activeProfile,
    currentRole: () => activeRole,
    auth: () => authInstance,
    database: () => databaseInstance
  };
})();
