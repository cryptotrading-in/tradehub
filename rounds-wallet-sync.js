(()=>{
  let timer=null;
  const money=n=>Number(n||0).toFixed(2);
  async function sync(){
    const input=document.getElementById('inv');
    if(!input)return;
    try{
      const res=await fetch('/api/rounds',{credentials:'same-origin',cache:'no-store'});
      const data=await res.json();
      if(!res.ok||!data.ok)return;
      const balance=Number(data.balance||0);
      input.value=balance>0?money(balance):'';
      input.readOnly=true;
      input.setAttribute('aria-label','Full available wallet balance');
    }catch{}
  }
  clearInterval(timer);
  timer=setInterval(sync,1000);
  sync();
})();
