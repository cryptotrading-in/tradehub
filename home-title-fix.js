(()=>{
  const home=()=>location.pathname==='/'||location.pathname==='/index.html';
  function fix(){
    if(!home())return;
    const heroes=document.querySelectorAll('.shell-hero');
    for(let i=1;i<heroes.length;i++)heroes[i].remove();
    const hero=document.querySelector('.shell-hero');
    if(hero)hero.style.display='block';
  }
  function start(){
    fix();
    const root=document.querySelector('.shell-content');
    if(root&&!root.__tradehubHomeHeroObserver){
      new MutationObserver(()=>fix()).observe(root,{childList:true,subtree:true});
      root.__tradehubHomeHeroObserver=true;
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
