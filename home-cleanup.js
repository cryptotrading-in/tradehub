(()=>{
  const isHome=()=>location.pathname==='/'||location.pathname==='/index.html';
  function apply(){
    const hero=document.querySelector('.shell-hero');
    if(hero&&!isHome())hero.style.display='';
  }
  function start(){apply();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  ['pushState','replaceState'].forEach(name=>{
    const original=history[name];
    if(original.__tradehubHomeCleanupHook)return;
    const wrapped=function(){const result=original.apply(this,arguments);setTimeout(apply,0);return result};
    wrapped.__tradehubHomeCleanupHook=true;
    history[name]=wrapped;
  });
  window.addEventListener('popstate',()=>setTimeout(apply,0));
})();
