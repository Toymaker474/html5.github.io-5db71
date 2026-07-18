const BUILD='8.0-safe';
const OLD_CACHE_PREFIX='pennyspawn-forge-';
const $=id=>document.getElementById(id);

function injectStyles(){
  if($('psStabilityStyles'))return;
  const style=document.createElement('style');
  style.id='psStabilityStyles';
  style.textContent=`
    .ps-safe-strip{position:relative;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px auto 18px;max-width:1240px;padding:11px 13px;border:1px solid rgba(104,255,179,.22);border-radius:18px;background:linear-gradient(120deg,rgba(19,36,38,.92),rgba(16,22,39,.94));box-shadow:0 16px 44px rgba(0,0,0,.22);backdrop-filter:blur(18px)}
    .ps-safe-strip>div{display:flex;align-items:center;gap:10px;min-width:0}.ps-safe-orb{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#fff,#6effb0 22%,#2b79ff 68%,#14182d);box-shadow:0 0 24px rgba(93,255,175,.28);font-size:15px}.ps-safe-copy{min-width:0}.ps-safe-copy b{display:block;color:#f4fbff;font-size:12px}.ps-safe-copy small{display:block;margin-top:2px;color:#8fa0bb;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ps-safe-actions{display:flex;gap:7px}.ps-safe-actions button{min-height:34px;padding:0 11px;border-radius:11px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.055);color:#eaf5ff;font-size:10px;font-weight:800}.ps-safe-actions .hot{background:linear-gradient(100deg,#67ffae,#65c7ff);color:#07120e;border:0}
    .ps-core-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0 2px}.ps-core-agent{position:relative;overflow:hidden;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(255,255,255,.035)}.ps-core-agent:before{content:'';position:absolute;inset:auto -20% -80% 20%;height:100px;background:radial-gradient(circle,rgba(99,255,179,.18),transparent 68%)}.ps-core-agent span{display:block;color:#6effb0;font-size:9px;font-weight:900;letter-spacing:.12em}.ps-core-agent b{display:block;margin-top:5px;color:#fff;font-size:12px}.ps-core-agent small{display:block;margin-top:4px;color:#8996ad;font-size:9px;line-height:1.35}.ps-recovery{position:fixed;z-index:99999;inset:16px;display:grid;place-items:center;background:rgba(0,0,0,.72);backdrop-filter:blur(20px)}.ps-recovery-card{width:min(460px,100%);padding:24px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:linear-gradient(150deg,#151d30,#080b12);box-shadow:0 35px 100px rgba(0,0,0,.55);color:white}.ps-recovery-card h1{font-size:25px;margin:0 0 8px}.ps-recovery-card p{color:#9aa8bf;line-height:1.55}.ps-recovery-card button{width:100%;min-height:48px;margin-top:10px;border:0;border-radius:15px;background:linear-gradient(100deg,#67ffae,#5ac5ff);font-weight:900;color:#06110d}.ps-recovery-card button+button{background:rgba(255,255,255,.06);color:white;border:1px solid rgba(255,255,255,.09)}
    @media(max-width:680px){.ps-safe-strip{margin:8px 12px 14px}.ps-safe-copy small{max-width:190px}.ps-safe-actions button:not(.hot){display:none}.ps-core-grid{grid-template-columns:1fr}.ps-core-agent{min-height:70px}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
  `;
  document.head.appendChild(style);
}

async function clearOldCaches(){
  if(!('caches'in window))return;
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(OLD_CACHE_PREFIX)&&key!=='pennyspawn-forge-v8').map(key=>caches.delete(key)));
}

async function hardRefresh(){
  try{
    if('serviceWorker'in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg=>reg.update().catch(()=>{})));
    }
    await clearOldCaches();
  }finally{
    const url=new URL(location.href);
    url.searchParams.set('v','8');
    url.searchParams.set('safe','1');
    location.replace(url.toString());
  }
}

function addSafeStrip(){
  if($('psSafeStrip'))return;
  const shell=$('appShell');
  const topbar=document.querySelector('.topbar');
  if(!shell||!topbar)return;
  const strip=document.createElement('section');
  strip.id='psSafeStrip';
  strip.className='ps-safe-strip';
  strip.innerHTML=`
    <div><span class="ps-safe-orb">⚡</span><span class="ps-safe-copy"><b>iPhone Safe Core · build ${BUILD}</b><small>Fast boot · AI loads only when tapped · old cache auto-cleaned</small></span></div>
    <span class="ps-safe-actions"><button id="psCleanBtn" type="button">Clean cache</button><button class="hot" id="psStatusBtn" type="button">3 agents live</button></span>`;
  topbar.insertAdjacentElement('afterend',strip);
  $('psCleanBtn').onclick=hardRefresh;
  $('psStatusBtn').onclick=()=>{
    document.querySelector('[data-view-target="agent"]')?.click();
  };
}

function addSubagents(){
  const plan=document.querySelector('.agent-plan');
  if(!plan||$('psCoreGrid'))return;
  const grid=document.createElement('section');
  grid.id='psCoreGrid';
  grid.className='ps-core-grid';
  grid.innerHTML=`
    <article class="ps-core-agent"><span>SUBAGENT 01</span><b>Scout</b><small>Finds useful visitor problems and ranks ideas locally.</small></article>
    <article class="ps-core-agent"><span>SUBAGENT 02</span><b>Builder</b><small>Turns the best idea into a tiny browser-first strategy.</small></article>
    <article class="ps-core-agent"><span>SUBAGENT 03</span><b>Auditor</b><small>Blocks unsafe claims, private keys, spam, and fake earnings.</small></article>`;
  plan.querySelector('.agent-stats')?.insertAdjacentElement('afterend',grid);
}

export function renderSafeCrash(error){
  injectStyles();
  document.querySelector('.ps-recovery')?.remove();
  const overlay=document.createElement('section');
  overlay.className='ps-recovery';
  overlay.innerHTML=`<div class="ps-recovery-card"><span>🛡️ SAFE RECOVERY</span><h1>PennySpawn stopped before Safari could crash.</h1><p>The heavy component was blocked. Your profiles and public wallet settings remain on this device.</p><button id="psRecoverBtn">Clean cache and reopen Safe Core</button><button id="psBasicBtn">Open basic dashboard</button><small style="display:block;margin-top:12px;color:#637089;word-break:break-word">${String(error?.message||error||'Unknown startup error').slice(0,240)}</small></div>`;
  document.body.appendChild(overlay);
  $('psRecoverBtn').onclick=hardRefresh;
  $('psBasicBtn').onclick=()=>overlay.remove();
}

export async function bootStability(){
  injectStyles();
  window.PS_RENDER_SAFE_CRASH=renderSafeCrash;
  clearOldCaches().catch(()=>{});
  const url=new URL(location.href);
  if(url.searchParams.get('v')!=='8'){
    url.searchParams.set('v','8');
    history.replaceState(null,'',url);
  }
  window.addEventListener('error',event=>{console.error(event.error||event.message)});
  window.addEventListener('unhandledrejection',event=>{console.error(event.reason)});
  const observer=new MutationObserver(()=>{addSafeStrip();addSubagents()});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
  addSafeStrip();
  addSubagents();
}
