(()=>{
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
const money=n=>Number(n||0).toFixed(2);
function style(){
 if($('referral-ui-style'))return;
 const s=document.createElement('style');s.id='referral-ui-style';
 s.textContent=`#referral{display:block;margin-top:16px}.referral-grid{display:grid;gap:14px}.referral-card{padding:18px;border:1px solid #ffffff1a;border-radius:18px;background:#141925b8}.referral-card h3{margin:0 0 6px;font-size:15px}.referral-sub{font-size:12px;color:#9ba5b7;margin-bottom:14px}.referral-code{display:grid;grid-template-columns:1fr auto;gap:8px}.referral-code input,.referral-link input{width:100%;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid #ffffff1a;background:#ffffff08;color:#fff}.referral-btn{border:0;border-radius:10px;padding:11px 14px;background:#7c6cff;color:#fff;font-weight:900;cursor:pointer}.referral-link{display:grid;grid-template-columns:1fr auto auto;gap:8px}.referral-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.referral-stat{padding:12px;background:#ffffff08;border:1px solid #ffffff0a;border-radius:11px}.referral-stat span{display:block;color:#9ba5b7;font-size:11px}.referral-stat b{display:block;margin-top:5px;font-size:18px}.referral-history{display:grid;gap:8px}.referral-row{display:flex;justify-content:space-between;gap:10px;padding:11px 12px;background:#ffffff08;border:1px solid #ffffff0a;border-radius:11px;font-size:12px}.referral-row span{color:#d8deea;line-height:1.5}.referral-row small{display:block;color:#9ba5b7;margin-top:3px}.referral-row b{white-space:nowrap;align-self:center}.referral-status-pending{color:#ffb84d}.referral-status-rewarded,.referral-status-qualified{color:#29c98a}.referral-status-disqualified,.referral-status-cancelled{color:#ff5f70}.referral-msg{font-size:12px;color:#9ba5b7;margin-top:9px}@media(max-width:700px){.referral-stats{grid-template-columns:1fr 1fr}.referral-code,.referral-link{grid-template-columns:1fr}.referral-btn{width:100%}}`;
 document.head.appendChild(s)
}
function ensure(){
 style();
 let section=$('referral');
 if(section)return section;
 section=document.createElement('section');section.id='referral';
 const hero=document.querySelector('.shell-hero');
 if(hero)hero.after(section);else document.querySelector('.shell-content')?.appendChild(section);
 section.innerHTML=`<div class="referral-grid">
  <div class="referral-card"><h3>Referral Program</h3><div class="referral-sub">Invite friends and earn rewards when they make their first qualifying deposit.</div><div class="referral-code"><input id="referralCode" readonly placeholder="Loading referral code..."><button class="referral-btn" id="referralCopyCode" type="button">Copy Code</button></div><div class="referral-msg" id="referralMsg"></div></div>
  <div class="referral-card"><h3>Your Referral Link</h3><div class="referral-sub">Share this link with friends to connect their signup to your referral.</div><div class="referral-link"><input id="referralLink" readonly placeholder="Loading referral link..."><button class="referral-btn" id="referralCopyLink" type="button">Copy Link</button><button class="referral-btn" id="referralShare" type="button">Share</button></div></div>
  <div class="referral-card"><h3>Referral Overview</h3><div class="referral-stats"><div class="referral-stat"><span>Total Referrals</span><b id="refTotal">0</b></div><div class="referral-stat"><span>Qualified Referrals</span><b id="refQualified">0</b></div><div class="referral-stat"><span>Pending Referrals</span><b id="refPending">0</b></div><div class="referral-stat"><span>Total Earned</span><b id="refEarned">0.00 USDT</b></div></div></div>
  <div class="referral-card"><h3>Referral Activity</h3><div class="referral-sub">Referral status and reward history.</div><div id="referralHistory" class="referral-history"></div></div>
 </div>`;
 $('referralCopyCode').onclick=()=>copy($('referralCode').value,'Referral code copied.');
 $('referralCopyLink').onclick=()=>copy($('referralLink').value,'Referral link copied.');
 $('referralShare').onclick=share;
 return section
}
async function copy(value,message){if(!value)return;try{await navigator.clipboard.writeText(value)}catch{const el=document.createElement('textarea');el.value=value;document.body.appendChild(el);el.select();document.execCommand('copy');el.remove()}$('referralMsg').textContent=message;}
async function share(){const link=$('referralLink')?.value||'';if(!link)return;try{if(navigator.share){await navigator.share({title:'TradeHub Referral',text:'Join TradeHub using my referral link.',url:link});return}await copy(link,'Referral link copied.')}catch(e){if(e?.name!=='AbortError')await copy(link,'Referral link copied.')}}
async function load(){
 const section=ensure();
 const hero=document.querySelector('.shell-hero');if(hero)hero.style.display='none';section.style.display='block';
 const msg=$('referralMsg');msg.textContent='Loading...';
 try{
  const r=await fetch('/api/referral/profile',{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.json()}catch{}
  if(!r.ok||!d.ok){msg.textContent=d.error||'Referral information could not be loaded.';return}
  $('referralCode').value=d.referral?.code||'';$('referralLink').value=d.referral?.link||'';
  const st=d.referral?.stats||{};$('refTotal').textContent=Number(st.total||0);$('refQualified').textContent=Number(st.qualified||0);$('refPending').textContent=Number(st.pending||0);$('refEarned').textContent=money(st.rewards)+' USDT';msg.textContent='';
  const rows=d.referral?.records||[];
  $('referralHistory').innerHTML=rows.map(v=>{const status=String(v.status||'Pending');const cls='referral-status-'+status.toLowerCase();const reward=Number(v.reward_amount||0);const amount=Number(v.qualifying_amount||0);const date=v.created_at?new Date(Number(v.created_at)*1000).toLocaleString():'';return `<div class="referral-row"><span>Referral · ${esc(status)}<small>${esc(date)}${amount>0?' · Qualifying deposit '+money(amount)+' USDT':''}</small></span><b class="${cls}">${status==='Rewarded'?money(reward)+' USDT':'—'}</b></div>`}).join('')||'<div class="referral-msg">No referrals yet.</div>';
 }catch{msg.textContent='Referral information is temporarily unavailable.'}
}
function start(){if(location.pathname!=='/referral'&&location.pathname!=='/referral/')return;ensure();load()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
