(()=>{
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
const money=n=>Number(n||0).toFixed(2);
function style(){
 if($('account-ui-style'))return;
 const s=document.createElement('style');s.id='account-ui-style';
 s.textContent=`#account{display:none;margin-top:16px}.account-grid{display:grid;gap:14px}.account-card{padding:18px;border:1px solid #ffffff1a;border-radius:18px;background:#141925b8}.account-card h3{margin:0 0 6px;font-size:15px}.account-card .account-sub{font-size:12px;color:#9ba5b7;margin-bottom:14px}.account-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.account-field label{display:block;font-size:11px;color:#9ba5b7;margin:0 0 5px}.account-field input,.account-filter{width:100%;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid #ffffff1a;background:#ffffff08;color:#fff}.account-field input[readonly]{opacity:.72}.account-actions{display:flex;gap:8px;margin-top:12px}.account-btn{border:0;border-radius:10px;padding:11px 14px;background:#7c6cff;color:#fff;font-weight:900;cursor:pointer}.account-msg{font-size:12px;color:#9ba5b7;margin-top:9px}.account-security-block{padding-top:12px;margin-top:12px;border-top:1px solid #ffffff0d}.account-history-tools{display:grid;grid-template-columns:180px 1fr;gap:10px;margin-bottom:10px}.account-history-list{display:grid;gap:8px}.account-history-row{display:flex;justify-content:space-between;gap:10px;padding:11px 12px;background:#ffffff08;border:1px solid #ffffff0a;border-radius:11px;font-size:12px}.account-history-row span{color:#d8deea;line-height:1.5}.account-history-row small{display:block;color:#9ba5b7;margin-top:3px}.account-history-row b{white-space:nowrap;align-self:center}.account-status{font-size:11px;color:#9ba5b7}.account-pin-note{font-size:11px;color:#9ba5b7;margin-top:6px}@media(max-width:560px){.account-fields{grid-template-columns:1fr}.account-history-tools{grid-template-columns:1fr}.account-actions{display:grid}.account-btn{width:100%}}`;
 document.head.appendChild(s)
}
function ensureMenuLogout(){
 const sidebar=document.querySelector('.sidebar');
 if(!sidebar||sidebar.querySelector('[data-account-logout]'))return;
 const b=document.createElement('button');b.className='nav-item';b.type='button';b.textContent='Logout';b.dataset.accountLogout='1';b.onclick=logout;
 sidebar.querySelector('.shell-nav')?.appendChild(b);
}
function ensure(){
 style();ensureMenuLogout();
 let section=$('account');
 if(!section){section=document.createElement('section');section.id='account';const hero=document.querySelector('.shell-hero');hero?.after(section)}
 if(section.dataset.ready)return section;
 section.innerHTML=`<div class="account-grid">
  <div class="account-card"><h3>Profile</h3><div class="account-sub">Your account information</div><div class="account-fields">
   <div class="account-field"><label>Full Name</label><input id="accountFullName"></div>
   <div class="account-field"><label>Username</label><input id="accountUsername" readonly></div>
   <div class="account-field"><label>Email</label><input id="accountEmail" readonly></div>
   <div class="account-field"><label>Phone</label><input id="accountPhone"></div>
  </div><div class="account-actions"><button class="account-btn" id="accountProfileSave" type="button">Save Profile</button></div><div id="accountProfileMsg" class="account-msg"></div></div>
  <div class="account-card"><h3>Security</h3><div class="account-sub">Protect your withdrawals and account</div>
   <div class="account-field"><label>Withdrawal Address</label><input id="accountWithdrawalAddress" placeholder="TRC20 address (T...)" autocomplete="off"></div>
   <div class="account-security-block"><div class="account-field" id="accountCurrentPinWrap" hidden><label>Current Withdrawal PIN</label><input id="accountCurrentPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off"></div><div class="account-field"><label>Set / Change 4-Digit Withdrawal PIN</label><input id="accountNewPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="new-password"></div><div class="account-pin-note" id="accountPinNote"></div></div>
   <div class="account-actions"><button class="account-btn" id="accountSecuritySave" type="button">Save Security Settings</button></div><div id="accountSecurityMsg" class="account-msg"></div>
   <div class="account-security-block"><h3>Change Password</h3><div class="account-fields"><div class="account-field"><label>Current Password</label><input id="accountCurrentPassword" type="password" autocomplete="current-password"></div><div class="account-field"><label>New Password</label><input id="accountNewPassword" type="password" autocomplete="new-password"></div><div class="account-field"><label>Confirm New Password</label><input id="accountConfirmPassword" type="password" autocomplete="new-password"></div></div><div class="account-actions"><button class="account-btn" id="accountPasswordSave" type="button">Change Password</button></div><div id="accountPasswordMsg" class="account-msg"></div></div>
  </div>
  <div class="account-card"><h3>History</h3><div class="account-sub">Every important wallet, auth and security event</div><div class="account-history-tools"><select id="accountHistoryFilter" class="account-filter"><option value="all">All Activity</option><option value="deposit">Deposit History</option><option value="withdrawal">Withdrawal History</option><option value="login">Login History</option><option value="security">Security / Account Activity</option></select><div id="accountHistoryMsg" class="account-msg"></div></div><div id="accountHistoryList" class="account-history-list"></div></div>
 </div>`;
 section.dataset.ready='1';
 $('accountProfileSave').onclick=saveProfile;$('accountSecuritySave').onclick=saveSecurity;$('accountPasswordSave').onclick=changePassword;$('accountHistoryFilter').onchange=loadHistory;
 return section
}
async function json(url,opts={}){const r=await fetch(url,{credentials:'same-origin',...opts});let d={};try{d=await r.json()}catch{}return {r,d}}
async function loadProfile(){const {r,d}=await json('/api/profile');if(!r.ok||!d.ok)return;$('accountFullName').value=d.profile.fullName||'';$('accountUsername').value=d.profile.username||'';$('accountEmail').value=d.profile.email||'';$('accountPhone').value=d.profile.phone||''}
async function saveProfile(){const msg=$('accountProfileMsg');msg.textContent='Saving...';const {r,d}=await json('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:$('accountFullName').value.trim(),phone:$('accountPhone').value.trim()})});msg.textContent=r.ok&&d.ok?'Profile saved.':(d.error||'Profile could not be saved.');if(r.ok&&d.ok)await loadProfile()}
async function loadSecurity(){const {r,d}=await json('/api/withdrawal-security');if(!r.ok||!d.ok)return;$('accountWithdrawalAddress').value=d.withdrawalAddress||'';$('accountCurrentPinWrap').hidden=!d.pinSet;$('accountPinNote').textContent=d.pinSet?'Current PIN is required when changing your withdrawal PIN.':'No withdrawal PIN is set yet. Create a 4-digit PIN.'}
async function saveSecurity(){const msg=$('accountSecurityMsg');msg.textContent='Saving...';const body={withdrawalAddress:$('accountWithdrawalAddress').value.trim(),pin:$('accountNewPin').value.trim()};const current=$('accountCurrentPin').value.trim();if(!$('accountCurrentPinWrap').hidden)body.currentPin=current;const {r,d}=await json('/api/withdrawal-security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});msg.textContent=r.ok&&d.ok?'Security settings saved.':(d.error||'Security settings could not be saved.');if(r.ok&&d.ok){$('accountNewPin').value='';$('accountCurrentPin').value='';await loadSecurity()}}
async function changePassword(){const msg=$('accountPasswordMsg');msg.textContent='Changing...';const {r,d}=await json('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:$('accountCurrentPassword').value,newPassword:$('accountNewPassword').value,confirmNewPassword:$('accountConfirmPassword').value})});msg.textContent=r.ok&&d.ok?'Password changed successfully.':(d.error||'Password could not be changed.');if(r.ok&&d.ok){$('accountCurrentPassword').value='';$('accountNewPassword').value='';$('accountConfirmPassword').value=''}}
async function loadHistory(){const list=$('accountHistoryList'),msg=$('accountHistoryMsg');msg.textContent='Loading...';const filter=$('accountHistoryFilter').value;const {r,d}=await json('/api/account-history?filter='+encodeURIComponent(filter));if(!r.ok||!d.ok){msg.textContent=d.error||'History could not be loaded.';list.innerHTML='';return}msg.textContent='';list.innerHTML=(d.history||[]).map(v=>`<div class="account-history-row"><span>${esc(v.title)}<small>${esc(v.details)} · ${new Date(Number(v.created_at)*1000).toLocaleString()}</small></span><b>${esc(v.status)}</b></div>`).join('')||'<div class="account-msg">No activity yet.</div>'}
async function logout(){const {r,d}=await json('/api/session/logout',{method:'POST',headers:{'Content-Type':'application/json'}});if(!r.ok||!d.ok)return;location.href='/signin/'}
function renderAccount(p){const section=ensure();const show=p==='/account';const hero=document.querySelector('.shell-hero');if(hero)hero.style.display=show?'none':'';section.style.display=show?'block':'none';if(show){loadProfile();loadSecurity();loadHistory()}}
const oldRender=window.render;
if(typeof oldRender==='function'){
 const wrap=function(p){oldRender.call(this,p);renderAccount(p)};
 window.render=wrap
}
const sync=()=>renderAccount(location.pathname.replace(/\/$/,'')||'/');
new MutationObserver(()=>{ensure()}).observe(document.documentElement,{childList:true,subtree:true});
ensure();
window.addEventListener('popstate',sync);
const nav=document.querySelectorAll('[data-r="/account"]');nav.forEach(b=>b.addEventListener('click',()=>setTimeout(sync,0)));
document.addEventListener('click',e=>{const shell=document.querySelector('.client-shell');if(!shell?.classList.contains('menu-open'))return;if(e.target.closest('.mobile-menu')||e.target.closest('.sidebar'))return;shell.classList.remove('menu-open')});
sync();
})();
