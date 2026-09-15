(()=>{
  const loaded=new Set();
  const routes={
    home:['/home-ui.js?v=home-v1','/activity-feed.js?v=feed-v4'],
    rounds:['/rounds-final-ui.js?v=rounds-final-v2','/rounds-live-fix.js?v=rounds-live-v1'],
    account:['/account-ui.js?v=account-v1'],
    referral:['/referral-ui.js?v=referral-v1']
  };
  function load(src){
    const clean=src.split('?')[0];
    if(loaded.has(clean)||document.querySelector(`script[src^="${clean}"]`)){loaded.add(clean);return Promise.resolve()}
    loaded.add(clean);
    return new Promise(resolve=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=resolve;document.body.appendChild(s)})
  }
  function sync(){Object.values(routes).flat().reduce((p,src)=>p.then(()=>load(src)),Promise.resolve())}
  function closeMenuOnOutsideClick(e){
    const shell=document.querySelector('.client-shell');
    if(!shell?.classList.contains('menu-open'))return;
    if(e.target.closest?.('.sidebar,.mobile-menu'))return;
    shell.classList.remove('menu-open')
  }
  if(!window.__tradehubRouteLoaderHooked){
    window.__tradehubRouteLoaderHooked=true;
    document.addEventListener('click',closeMenuOnOutsideClick,true);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync()
  }
})();
