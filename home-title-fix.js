(()=>{
  const home=()=>location.pathname==='/'||location.pathname==='/index.html';
  let welcome='';
  async function session(){
    if(!home())return;
    try{
      const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
      const d=await r.json();
      if(d.authenticated&&d.session?.fullName)welcome='Welcome, '+d.session.fullName;
      fix();
    }catch{}
  }
  function fix(){
    if(!home())return;
    const heroes=document.querySelectorAll('.shell-hero');
    for(let i=1;i<heroes.length;i++)heroes[i].remove();
    const hero=document.querySelector('.shell-hero');
    if(hero)hero.style.display='block';
    const el=document.getElementById('title');
    if(!el)return;
    if(welcome){
      el.textContent=welcome;
    }else if(el.textContent==='Your trading experience starts here.'){
      el.textContent='';
    }
  }
  function start(){
    fix();
    const root=document.querySelector('.shell-content');
    if(root)new MutationObserver(()=>fix()).observe(root,{childList:true,characterData:true,subtree:true});
    session();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
