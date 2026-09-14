(()=>{
  const FAKE=[
    ['Hy*','deposited',500],['Be*','withdrew',300],['Ah*','completed Round 3',0],['Sa*','received bonus',50],['Mu*','deposited',250],['Za*','logged in',0],['Al*','received referral bonus',25],['Fa*','completed Round 2',0],['Ra*','deposited',750],['No*','withdrew',400],
    ['Ha*','logged in',0],['Us*','received bonus',30],['Ka*','deposited',350],['Am*','completed Round 5',0],['Mo*','withdrew',220],['Ta*','deposited',600],['Sa*','logged in',0],['Iq*','received referral bonus',20],['Bi*','completed Round 1',0],['Za*','deposited',450],
    ['Hu*','withdrew',180],['Ad*','received bonus',45],['Na*','logged in',0],['Fa*','deposited',900],['Ri*','completed Round 4',0],['As*','withdrew',275],['Ma*','deposited',320],['Ar*','received referral bonus',35],['Ha*','logged in',0],['Sa*','completed Round 6',0],
    ['Us*','deposited',550],['Ka*','withdrew',240],['Ah*','received bonus',55],['No*','completed Round 3',0],['Mu*','logged in',0],['Ta*','deposited',280],['Be*','received referral bonus',30],['Hy*','withdrew',350],['Za*','completed Round 2',0],['Al*','deposited',410],
    ['Fa*','logged in',0],['Ra*','received bonus',40],['Mo*','deposited',680],['Iq*','withdrew',260],['Am*','completed Round 5',0],['Bi*','deposited',390],['No*','received referral bonus',25],['Ad*','logged in',0],['Ri*','withdrew',190],['Hu*','completed Round 1',0]
  ].map((x,i)=>({id:'demo:'+i,name:x[0],type:/deposited/.test(x[1])?'deposit':/withdrew/.test(x[1])?'withdrawal':/logged/.test(x[1])?'login':/referral/.test(x[1])?'referral_bonus':/bonus/.test(x[1])?'bonus':'round',amount:x[2],created_at:0,demo:true,text:x[1]}));
  const esc=s=>String(s??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>Number(n||0).toFixed(2);
  const text=a=>a.demo?`${a.name} ${a.text}${a.amount?` ${money(a.amount)} USDT`:''}`:`${a.name} ${a.type==='deposit'?'deposited':a.type==='withdrawal'?'withdrew':a.type==='login'?'logged in':a.type==='referral_bonus'?'received referral bonus':a.type==='bonus'?'received bonus':'completed a round'}${a.amount?` ${money(a.amount)} USDT`:''}`;
  let refreshData=async()=>{};
  function install(){
    if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
    let box=document.getElementById('tradehubActivityFeed');
    if(box){box.style.display='block';return;}
    const home=document.querySelector('.shell-content');
    if(!home){setTimeout(install,100);return;}
    let style=document.getElementById('tradehubActivityFeedStyle');
    if(!style){
      style=document.createElement('style');
      style.id='tradehubActivityFeedStyle';
      style.textContent='#tradehubActivityFeed{position:relative;z-index:5;display:block!important;margin:12px auto 0;width:min(92%,390px);min-height:42px;pointer-events:none}.thaf-item{box-sizing:border-box;display:block!important;padding:10px 12px;border:1px solid rgba(255,255,255,.25);border-radius:12px;background:#000;color:#fff!important;box-shadow:0 8px 20px rgba(0,0,0,.35);font-size:12px;font-weight:700;line-height:1.4;opacity:1!important;transform:none!important}.thaf-dot{display:inline-block;margin-right:6px;font-size:9px;color:#fff}@media(max-width:360px){#tradehubActivityFeed{display:block!important;width:94%}}';
      document.head.appendChild(style);
    }
    box=document.createElement('div');box.id='tradehubActivityFeed';box.setAttribute('aria-live','polite');
    const hero=home.querySelector('.shell-hero');
    if(hero)hero.insertAdjacentElement('afterend',box);else home.appendChild(box);
    let real=[],idx=0;
    refreshData=async()=>{try{const r=await fetch('/api/activity-feed',{credentials:'same-origin',cache:'no-store'}),d=await r.json();if(r.ok&&d.ok)real=(d.activities||[]).map(a=>({...a,demo:false}));}catch{}};
    function next(){
      if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
      const pool=real.length?real.concat(FAKE):FAKE;
      if(!pool.length)return;
      const a=pool[idx%pool.length];idx++;
      box.innerHTML=`<div class="thaf-item"><span class="thaf-dot">●</span>${esc(text(a))}</div>`;
    }
    refreshData();setTimeout(next,500);setInterval(next,2400);setInterval(refreshData,12000);
  }
  function sync(){
    const isHome=location.pathname==='/'||location.pathname==='/index.html';
    const box=document.getElementById('tradehubActivityFeed');
    if(!isHome){if(box)box.style.display='none';return;}
    install();
  }
  function hookNavigation(){
    ['pushState','replaceState'].forEach(name=>{
      const original=history[name];
      if(original.__tradehubActivityFeedHook)return;
      const wrapped=function(){const result=original.apply(this,arguments);setTimeout(sync,0);return result};
      wrapped.__tradehubActivityFeedHook=true;
      history[name]=wrapped;
    });
    window.addEventListener('popstate',()=>setTimeout(sync,0));
  }
  function start(){hookNavigation();sync()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
