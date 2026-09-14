(()=>{
  const home=()=>location.pathname==='/'||location.pathname==='/index.html';
  const ID='tradehubHomeRules';
  function ensure(){
    if(!home())return;
    if(document.getElementById(ID))return;
    const content=document.querySelector('.shell-content');
    const hero=document.querySelector('.shell-hero');
    if(!content||!hero)return;
    const section=document.createElement('section');
    section.id=ID;
    section.innerHTML=`
      <div class="th-rules-block">
        <div class="th-rules-head">
          <div><span class="th-rules-label">TRADING RULES</span><h3>Trade with clarity and discipline.</h3></div>
          <button type="button" class="th-rules-toggle" aria-expanded="false">View Rules <span>⌄</span></button>
        </div>
        <p class="th-rules-summary">Trade with discipline, not emotion. Every round follows a clear Entry Window, Countdown, Trade Lock and Final Result.</p>
        <div class="th-rules-details" hidden>
          <div class="th-rule"><b>01</b><span>Choose <strong>UP</strong> or <strong>DOWN</strong> before the Entry Window closes.</span></div>
          <div class="th-rule"><b>02</b><span>Once a round is locked, your position cannot be changed or cancelled.</span></div>
          <div class="th-rule"><b>03</b><span>Every result is final. Trade responsibly and never risk more than you can afford to lose.</span></div>
        </div>
      </div>
      <div class="th-rules-block th-referral-block">
        <div class="th-rules-head">
          <div><span class="th-rules-label th-ref-label">REFERRAL PROGRAM</span><h3>Invite friends. Earn rewards.</h3></div>
          <button type="button" class="th-rules-toggle" aria-expanded="false">View Rules <span>⌄</span></button>
        </div>
        <p class="th-rules-summary">Share your unique referral link and earn <strong>5 USDT</strong> when a referred user completes their first approved deposit of <strong>50 USDT or more</strong>.</p>
        <div class="th-rules-details" hidden>
          <div class="th-ref-step"><b>01</b><span>Share your unique referral link.</span></div>
          <div class="th-ref-step"><b>02</b><span>Your friend signs up through your referral link.</span></div>
          <div class="th-ref-step"><b>03</b><span>The referred user completes their first approved deposit of <strong>≥ 50 USDT</strong>.</span></div>
          <div class="th-ref-step"><b>04</b><span>The referral becomes <strong>Qualified</strong>.</span></div>
          <div class="th-ref-step"><b>05</b><span>You receive a one-time <strong>5 USDT</strong> reward.</span></div>
          <div class="th-ref-note">Signup alone does not generate a reward. Pending or rejected deposits do not qualify. Self-referrals, duplicate accounts and referral abuse are not eligible.</div>
        </div>
      </div>`;
    content.insertBefore(section,content.querySelector('#rounds'));
    section.querySelectorAll('.th-rules-toggle').forEach(button=>{
      button.addEventListener('click',()=>{
        const details=button.closest('.th-rules-block').querySelector('.th-rules-details');
        const open=button.getAttribute('aria-expanded')==='true';
        details.hidden=open;
        button.setAttribute('aria-expanded',String(!open));
        button.innerHTML=(open?'View Rules':'Hide Rules')+' <span>'+(open?'⌄':'⌃')+'</span>';
      });
    });
  }
  function style(){
    if(document.getElementById('tradehubHomeRulesStyle'))return;
    const s=document.createElement('style');s.id='tradehubHomeRulesStyle';s.textContent=`
      #tradehubHomeRules{display:block;margin-top:18px}
      .th-rules-block{padding:18px 18px 16px;border:1px solid #ffffff12;border-radius:18px;background:linear-gradient(145deg,#141925b8,#0d121cb0);box-shadow:0 14px 35px rgba(0,0,0,.16)}
      .th-referral-block{margin-top:12px}
      .th-rules-head{display:flex;align-items:center;justify-content:space-between;gap:14px}
      .th-rules-label{font-size:10px;letter-spacing:1.8px;font-weight:900;color:#a9a1ff}
      .th-ref-label{color:#29c98a}
      .th-rules-head h3{margin:5px 0 0;font-size:15px;font-weight:900;color:#fff}
      .th-rules-summary{margin:10px 0 0;color:#9ba5b7;font-size:12px;line-height:1.65;max-width:850px}
      .th-rules-toggle{border:1px solid #ffffff16;background:#ffffff08;color:#d8deea;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:900;white-space:nowrap;cursor:pointer}
      .th-rules-toggle span{margin-left:4px;color:#a9a1ff}
      .th-rules-details{margin-top:14px;padding-top:13px;border-top:1px solid #ffffff0d}
      .th-rule,.th-ref-step{display:flex;gap:11px;align-items:flex-start;padding:8px 0;color:#d8deea;font-size:12px;line-height:1.55}
      .th-rule b,.th-ref-step b{flex:0 0 24px;color:#7c6cff;font-size:10px;padding-top:2px}
      .th-ref-step b{color:#29c98a}
      .th-rule strong,.th-ref-step strong{color:#fff}
      .th-ref-note{margin-top:8px;padding:10px 11px;border-radius:10px;background:#ffffff06;color:#7f8a9f;font-size:11px;line-height:1.55}
      @media(max-width:560px){.th-rules-head{align-items:flex-start}.th-rules-head h3{font-size:14px}.th-rules-toggle{padding:8px 9px}.th-rules-summary{font-size:11.5px}}
    `;document.head.appendChild(s)
  }
  function start(){if(!home())return;style();ensure()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  ['pushState','replaceState'].forEach(name=>{const original=history[name];if(original.__tradehubRulesHook)return;const wrapped=function(){const result=original.apply(this,arguments);setTimeout(start,0);return result};wrapped.__tradehubRulesHook=true;history[name]=wrapped});
  window.addEventListener('popstate',()=>setTimeout(start,0));
})();
