(()=>{
  const loaded=new Set();
  const routes={
    home:['/home-ui.js?v=home-v1','/activity-feed.js?v=feed-v4'],
    rounds:['/rounds-final-ui.js?v=rounds-final-v2','/rounds-live-fix.js?v=rounds-live-v1'],
    account:['/account-ui.js?v=account-v1'],
    referral:['/referral-ui.js?v=referral-v1']
  };
  const norm=p=>!p||p==='/index.html'?'/':p.replace(/\/$/,'')||'/';
  function route(p=location.pathname){
    p=norm(p);
    if(p==='/')return 'home';
    if(p==='/rounds')return 'rounds';
    if(p==='/account')return 'account';
    if(p==='/referral')return 'referral';
    return null;
  }
  function load(src){
    const clean=src.split('?')[0];
    if(loaded.has(clean)||document.querySelector(`script[src^="${clean}"]`)){
      loaded.add(clean);return Promise.resolve();
    }
    loaded.add(clean);
    return new Promise(resolve=>{
      const s=document.createElement('script');
      s.src=src;s.defer=true;s.onload=resolve;s.onerror=resolve;
      document.body.appendChild(s);
    });
  }
  function sync(){
    const list=routes[route()]||[];
    list.reduce((p,src)=>p.then(()=>load(src)),Promise.resolve());
  }
  ['pushState','replaceState'].forEach(name=>{
    const original=history[name];
    if(original.__tradehubRouteLoaderHook)return;
    const wrapped=function(){const result=original.apply(this,arguments);setTimeout(sync,0);return result};
    wrapped.__tradehubRouteLoaderHook=true;
    history[name]=wrapped;
  });
  window.addEventListener('popstate',()=>setTimeout(sync,0));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});
  else sync();
})();
