(()=>{
  const $=id=>document.getElementById(id);
  const home=()=>location.pathname==='/'||location.pathname==='/index.html';
  const money=n=>Number(n||0).toFixed(2);
  const esc=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  let rounds=[];
  let timer=null;
  let ready=false;

  function style(){
    if($('tradehubHomeUiStyle'))return;
    const s=document.createElement('style');s.id='tradehubHomeUiStyle';
    s.textContent=`
      #tradehubHomePanels{display:grid;gap:14px;margin-top:18px}
      .th-home-card{padding:18px;border:1px solid #ffffff12;border-radius:18px;background:linear-gradient(145deg,#141925b8,#0d121cb0);box-shadow:0 14px 35px rgba(0,0,0,.16)}
      .th-home-card h3{margin:5px 0 0;font-size:16px;font-weight:900}.th-home-label{font-size:10px;letter-spacing:1.8px;font-weight:900;color:#a9a1ff}
      .th-home-muted{color:#9ba5b7;font-size:12px;line-height:1.65}.th-home-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
      .th-home-stat{padding:12px;background:#ffffff08;border:1px solid #ffffff0a;border-radius:11px}.th-home-stat span{display:block;color:#9ba5b7;font-size:11px}.th-home-stat b{display:block;margin-top:5px;font-size:18px}
      .th-home-countdown{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;padding:14px;border-radius:13px;background:#ffffff08;border:1px solid #ffffff0a}
      .th-home-countdown strong{font-size:30px;letter-spacing:.03em}.th-home-countdown small{display:block;color:#9ba5b7;margin-top:3px}
      .th-why-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.th-why-item{padding:12px;background:#ffffff06;border-radius:11px}.th-why-item b{display:block;font-size:12px}.th-why-item span{display:block;margin-top:6px;color:#9ba5b7;font-size:11px;line-height:1.55}
      .th-ref-front{display:grid;gap:9px;margin-top:14px}.th-ref-line{display:flex;gap:10px;align-items:flex-start;color:#d8deea;font-size:12px;line-height:1.55}.th-ref-line b{flex:0 0 24px;color:#29c98a;font-size:10px}
      @media(max-width:560px){.th-home-stats,.th-why-grid{grid-template-columns:1fr}.th-home-countdown{align-items:flex-start;flex-direction:column}.th-home-countdown strong{font-size:27px}}
    `;document.head.appendChild(s)
  }

  function ensure(){
    if(!home())return;
    style();
    let box=$('tradehubHomePanels');
    if(box)return box;
    const content=document.querySelector('.shell-content');
    const hero=document.querySelector('.shell-hero');
    if(!content)return null;
    box=document.createElement('div');box.id='tradehubHomePanels';
    box.innerHTML=`
      <section class="th-home-card" id="tradehubHomeStats">
        <span class="th-home-label">LIVE STATS</span><h3>Tradehub Round Status</h3>
        <div class="th-home-stats"><div class="th-home-stat"><span>Total Rounds</span><b id="thStatTotal">—</b></div><div class="th-home-stat"><span>Open for Entry</span><b id="thStatOpen">—</b></div><div class="th-home-stat"><span>Next Round</span><b id="thStatNext">—</b></div></div>
      </section>
      <section class="th-home-card" id="tradehubHomeCountdown">
        <span class="th-home-label">FIRST ROUND COUNTDOWN</span><h3 id="thCountdownTitle">Loading round...</h3>
        <div class="th-home-countdown"><div><strong id="thCountdown">—</strong><small id="thCountdownNote">Waiting for round data</small></div><div class="th-home-muted" id="thCountdownState">—</div></div>
      </section>
      <section class="th-home-card" id="tradehubWhy">
        <span class="th-home-label">WHY TRADEHUB</span><h3>Simple rounds. Clear outcomes. No exchange clutter.</h3>
        <div class="th-why-grid"><div class="th-why-item"><b>One Round → One Outcome</b><span>Each round has a clear entry window, lock, result and balance update.</span></div><div class="th-why-item"><b>Clear UP / DOWN Flow</b><span>Choose your direction before the entry window closes.</span></div><div class="th-why-item"><b>Server-Side Ledger</b><span>Your wallet balance and round settlement are handled by the server-side ledger.</span></div></div>
      </section>
      <section class="th-home-card" id="tradehubReferralFront">
        <span class="th-home-label" style="color:#29c98a">REFERRAL PROGRAM</span><h3>Invite friends. Earn rewards.</h3>
        <p class="th-home-muted">Share your unique referral link and earn <strong>5 USDT</strong> when a referred user completes their first approved deposit of <strong>50 USDT or more</strong>.</p>
        <div class="th-ref-front"><div class="th-ref-line"><b>01</b><span>Share your unique referral link.</span></div><div class="th-ref-line"><b>02</b><span>Your friend signs up through your referral link.</span></div><div class="th-ref-line"><b>03</b><span>The referred user completes their first approved deposit of <strong>≥ 50 USDT</strong>.</span></div><div class="th-ref-line"><b>04</b><span>The referral becomes <strong>Qualified</strong>.</span></div><div class="th-ref-line"><b>05</b><span>You receive a one-time <strong>5 USDT</strong> reward.</span></div></div>
      </section>`;
    if(hero)hero.after(box);else content.prepend(box);
    return box;
  }

  function formatTime(seconds){seconds=Math.max(0,Math.floor(seconds));return Math.floor(seconds/3600)+':'+String(Math.floor((seconds%3600)/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
  function renderStats(){
    if(!home()||!$('tradehubHomePanels'))return;
    const now=Date.now()/1000;
    const open=rounds.filter(r=>{const start=Number(r.startAt),entry=start+Math.max(15,Number(r.entryWindowSeconds||0));return now>=start&&now<entry}).length;
    const next=rounds.find(r=>Number(r.startAt)>now);
    $('thStatTotal').textContent=rounds.length;
    $('thStatOpen').textContent=open;
    $('thStatNext').textContent=next?new Date(Number(next.startAt)*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—';
  }
  function renderCountdown(){
    if(!home())return;
    const r=rounds[0];if(!r)return;
    const now=Date.now()/1000,start=Number(r.startAt),end=start+Number(r.durationSeconds||0),entry=start+Math.max(15,Number(r.entryWindowSeconds||0));
    let target=start,label='Starts in',state='UPCOMING';
    if(now>=start&&now<entry){target=entry;label='Entry closes in';state='ENTRY OPEN'}
    else if(now>=entry&&now<end){target=end;label='Round ends in';state='LOCKED'}
    else if(now>=end){state='RESULT';target=end;label='Round completed';}
    const left=Math.max(0,target-now);
    $('thCountdownTitle').textContent='Round '+r.roundNo+' · '+(r.direction||'—');
    $('thCountdown').textContent=state==='RESULT'?'RESULT':formatTime(left);
    $('thCountdownNote').textContent=state==='RESULT'?label:label+' · '+new Date(target*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    $('thCountdownState').textContent=state;
  }
  async function loadRounds(){
    if(!home())return;
    try{const r=await fetch('/api/rounds',{credentials:'same-origin',cache:'no-store'}),d=await r.json();if(!r.ok||!d.ok)return;rounds=(d.rounds||[]).slice().sort((a,b)=>Number(a.startAt)-Number(b.startAt));renderStats();renderCountdown()}catch{}
  }
  async function syncAuth(){
    if(!home())return;
    const hero=document.querySelector('.shell-hero');if(!hero)return;
    try{const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'}),d=await r.json();hero.style.display=d.authenticated?'none':'';const c=$('cta');if(c)c.style.display=d.authenticated?'none':'block'}catch{hero.style.display=''}
  }
  function sync(){
    const active=home();
    const box=$('tradehubHomePanels');
    if(box)box.style.display=active?'grid':'none';
    if(!active){if(timer){clearInterval(timer);timer=null}return}
    ensure();syncAuth();loadRounds();
    if(!timer)timer=setInterval(()=>{if(!home()){clearInterval(timer);timer=null;return}renderStats();renderCountdown()},1000);
  }
  function hook(){
    window.addEventListener('popstate',sync);
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-r]'))setTimeout(sync,0)},true);
  }
  function start(){if(ready)return;ready=true;hook();sync()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
