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
      style.textContent=`#tradehubActivityFeed{position:relative;z-index:2;display:block!important;width:100%;height:220px;margin:24px 0 0;overflow:hidden;pointer-events:none}#tradehubActivityFeed .thaf-item{position:absolute;left:0;right:0;bottom:0;box-sizing:border-box;display:flex!important;align-items:center;min-height:36px;padding:5px 2px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;font-weight:800;line-height:1.35;letter-spacing:.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:transparent!important;border:0!important;box-shadow:none!important;opacity:0;transform:translate3d(0,20px,0) scale(.985);clip-path:inset(0 0 0 0);transition:transform .62s cubic-bezier(.16,1,.3,1),opacity .48s ease,clip-path .62s cubic-bezier(.16,1,.3,1);will-change:transform,opacity,clip-path}#tradehubActivityFeed .thaf-item.is-live{opacity:.5;transform:translate3d(0,var(--y,0px),0) scale(1)}#tradehubActivityFeed .thaf-item.is-exit{opacity:0;transform:translate3d(0,-240px,0) scale(.96);clip-path:inset(0 0 100% 0)}#tradehubActivityFeed .thaf-text{background:linear-gradient(90deg,#ffffff 0%,#b9c6ff 34%,#8f7cff 68%,#6fffd0 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 18px rgba(124,108,255,.16)}#tradehubActivityFeed .thaf-dot{width:7px;height:7px;flex:0 0 7px;margin:0 9px 0 2px;border-radius:50%;background:linear-gradient(135deg,#29c98a,#7c6cff);box-shadow:0 0 12px rgba(41,201,138,.42)}@media(max-width:560px){#tradehubActivityFeed{height:215px;margin-top:20px}#tradehubActivityFeed .thaf-item{font-size:12px}}`;
      document.head.appendChild(style);
    }
    box=document.createElement('div');box.id='tradehubActivityFeed';box.setAttribute('aria-live','polite');
    const hero=home.querySelector('.shell-hero');
    if(hero)hero.appendChild(box);else home.appendChild(box);
    let real=[],idx=0,visible=[];
    refreshData=async()=>{try{const r=await fetch('/api/activity-feed',{credentials:'same-origin',cache:'no-store'}),d=await r.json();if(r.ok&&d.ok)real=(d.activities||[]).map(a=>({...a,demo:false}));}catch{}};
    function pool(){return real.length?real.concat(FAKE):FAKE}
    function renderPositions(){
      const step=window.matchMedia('(max-width:560px)').matches?39:40;
      visible.forEach((el,i)=>{el.style.setProperty('--y',`${-i*step}px`);requestAnimationFrame(()=>el.classList.add('is-live'))});
    }
    function add(a){
      const el=document.createElement('div');
      el.className='thaf-item';
      el.innerHTML=`<span class="thaf-dot" aria-hidden="true"></span><span class="thaf-text">${esc(text(a))}</span>`;
      box.appendChild(el);
      visible.push(el);
      if(visible.length>5){
        const old=visible.shift();
        old.classList.remove('is-live');
        old.classList.add('is-exit');
        setTimeout(()=>old.remove(),650);
      }
      renderPositions();
    }
    function next(){
      if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
      const p=pool();if(!p.length)return;
      add(p[idx%p.length]);idx++;
    }
    refreshData();
    for(let i=0;i<5;i++)setTimeout(next,i*120);
    setInterval(next,2400);
    setInterval(refreshData,12000);
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
