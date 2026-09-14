(()=>{
  const home=()=>location.pathname==='/'||location.pathname==='/index.html';
  let fullName='';
  let loading=false;
  function paint(){
    if(!home())return;
    const heroes=document.querySelectorAll('.shell-hero');
    for(let i=1;i<heroes.length;i++)heroes[i].remove();
    const hero=document.querySelector('.shell-hero');
    if(hero)hero.style.display='block';
    const title=document.getElementById('title');
    const desc=document.getElementById('desc');
    if(title)title.textContent=fullName?'Welcome, '+fullName:'Your trading experience starts here.';
    if(desc)desc.textContent=fullName?'':'Trade smarter with a simple, secure workspace.';
  }
  async function loadName(){
    if(!home()||loading)return;
    loading=true;
    try{
      const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
      const d=await r.json();
      fullName=d.authenticated&&d.session?.fullName?String(d.session.fullName):'';
    }catch{fullName=''}
    finally{loading=false;paint()}
  }
  function sync(){
    paint();
    if(home())loadName();
  }
  function hookNavigation(){
    ['pushState','replaceState'].forEach(name=>{
      const original=history[name];
      if(original.__tradehubHomeHeroHook)return;
      const wrapped=function(){
        const result=original.apply(this,arguments);
        setTimeout(sync,0);
        return result;
      };
      wrapped.__tradehubHomeHeroHook=true;
      history[name]=wrapped;
    });
    window.addEventListener('popstate',()=>setTimeout(sync,0));
  }
  function start(){
    hookNavigation();
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
