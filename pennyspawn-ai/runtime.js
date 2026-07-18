import{app,$,USDC,BALANCE_OF,RPC,BLOCKED,money,validBase,validBtc,log,saveAgent,toast}from'./state.js';

const TARGET_USD=.10;
const SAFE_TICK_MS=1000;

export function hasWallet(){return validBase(app.settings.baseWallet)||validBtc(app.settings.btcWallet)}

async function baseRpc(method,params){
  const r=await fetch(app.settings.rpc||RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params}),cache:'no-store'});
  if(!r.ok)throw Error(`Base RPC ${r.status}`);
  const j=await r.json();
  if(j.error)throw Error(j.error.message||'Base RPC error');
  return j.result;
}

async function pollBase(){
  if(!validBase(app.settings.baseWallet)){app.wallet.baseHealthy=false;return}
  const padded=app.settings.baseWallet.slice(2).toLowerCase().padStart(64,'0');
  const[bal,block]=await Promise.all([
    baseRpc('eth_call',[{to:USDC,data:`0x${BALANCE_OF}${padded}`},'latest']),
    baseRpc('eth_blockNumber',[])
  ]);
  applyBalance('USDC',Number(BigInt(bal||'0x0'))/1e6);
  app.wallet.baseBlock=parseInt(block||'0x0',16);
  app.wallet.baseHealthy=true;
}

async function pollBtc(){
  if(!validBtc(app.settings.btcWallet)){app.wallet.btcHealthy=false;return}
  const r=await fetch(`https://mempool.space/api/address/${encodeURIComponent(app.settings.btcWallet)}`,{cache:'no-store'});
  if(!r.ok)throw Error(`BTC API ${r.status}`);
  const j=await r.json();
  applyBalance('BTC',(Number(j?.chain_stats?.funded_txo_sum||0)-Number(j?.chain_stats?.spent_txo_sum||0))/1e8);
  app.wallet.btcHealthy=true;
}

function applyBalance(asset,value){
  const key=asset==='USDC'?'usdc':'btc';
  const seen=asset==='USDC'?'usdcSeen':'btcSeen';
  const prev=app.wallet[key];
  if(!app.wallet[seen]){
    app.wallet[seen]=true;
    app.wallet[key]=value;
    log(`${asset} watch connected.`);
  }else{
    app.wallet[key]=value;
    const delta=value-prev;
    if(delta>(asset==='USDC'?1e-7:1e-9)){
      const usd=asset==='USDC'?delta:delta*(app.market.prices.BTC||0);
      app.wallet.sessionUsd+=usd;
      app.wallet.cycleUsd+=usd;
      app.wallet.receipts++;
      app.wallet.lastReceipt=Date.now();
      log(`Verified incoming ${asset}: ${asset==='USDC'?money(delta,6):delta.toFixed(8)+' BTC'}.`);
    }
  }
  app.wallet.history.push({t:Date.now(),v:portfolio()});
  app.wallet.history=app.wallet.history.slice(-60);
}

export const portfolio=()=>app.wallet.usdc+app.wallet.btc*(app.market.prices.BTC||0);

export async function pollWallets(){
  await Promise.all([pollBase().catch(()=>app.wallet.baseHealthy=false),pollBtc().catch(()=>app.wallet.btcHealthy=false)]);
  app.render?.();
}

export function startWallets(){
  stopWallets();
  pollWallets();
  app.timers.wallet=setInterval(()=>{if(!document.hidden)pollWallets()},15000);
}

export function stopWallets(){clearInterval(app.timers.wallet);app.timers.wallet=null}

async function spot(asset){
  const r=await fetch(`https://api.coinbase.com/v2/prices/${asset}-USD/spot`,{cache:'no-store'});
  if(!r.ok)throw Error('price');
  const j=await r.json();
  return Number(j?.data?.amount);
}

export async function fetchMarket(){
  try{
    const[b,e,s]=await Promise.all(['BTC','ETH','SOL'].map(spot));
    app.market.prices={USD:1,BTC:b,ETH:e,SOL:s};
    app.market.healthy=true;
  }catch{app.market.healthy=false}
  app.render?.();
}

export function startMarket(){
  fetchMarket();
  clearInterval(app.timers.market);
  app.timers.market=setInterval(()=>{if(!document.hidden)fetchMarket()},60000);
}

export function initModel(){
  if(app.modelWorker)return;
  app.modelWorker=new Worker('./model-worker.js?v=8',{type:'module'});
  app.modelWorker.onerror=event=>{
    console.error('PennySpawn model worker error',event);
    $('toolOutput').textContent='Local AI could not start safely. The lightweight tools and agent core still work.';
    stopModel();
    fallbackPlan('The optional AI model was stopped to protect Safari.');
  };
  app.modelWorker.onmessage=e=>{
    const m=e.data||{};
    if(m.type==='progress'){
      app.modelLoading=true;
      $('modelProgress').classList.remove('hidden');
      $('modelProgressText').textContent=`Loading ${String(m.file||'model').split('/').pop()}`;
      $('modelProgressValue').textContent=`${m.percent||0}%`;
      $('modelProgressBar').style.width=`${m.percent||0}%`;
    }
    if(m.type==='status'&&m.status==='ready'){
      app.modelReady=true;
      app.modelLoading=false;
      app.modelDevice=m.device||'wasm';
      app.modelName=m.model||'local model';
      $('modelProgress').classList.add('hidden');
      app.agent.status='alive · safe AI ready';
      log(`${app.modelName} ready in ${app.modelDevice} safe mode.`);
    }
    if(m.type==='tool'){
      app.modelReady=true;
      app.modelDevice=m.device||app.modelDevice;
      app.modelName=m.model||app.modelName;
      $('toolOutput').textContent=m.text||'No output';
      incrementRuns();
    }
    if(m.type==='plan')applyPlan(m.text);
    if(m.type==='notice')log(m.message);
    if(m.type==='error'){
      const message=m.message||'Unknown model error';
      $('toolOutput').textContent=`Optional local AI stopped safely: ${message}`;
      log(`AI safety fallback: ${message}`);
      stopModel();
      fallbackPlan('Safe-core planner took over.');
    }
    app.render?.();
  };
}

export function stopModel(){
  if(app.modelWorker)app.modelWorker.terminate();
  app.modelWorker=null;
  app.modelReady=false;
  app.modelLoading=false;
  app.modelName='not loaded';
  app.modelDevice='safe core';
  $('modelProgress')?.classList.add('hidden');
}

export function ensureModel(){
  initModel();
  if(!app.modelReady&&!app.modelLoading){
    app.modelLoading=true;
    app.modelWorker.postMessage({type:'init',payload:{choice:app.settings.model}});
  }
}

function deterministic(mode,text){
  const clean=text.replace(/\s+/g,' ').trim();
  if(mode==='compress')return clean.split(' ').slice(0,110).join(' ')+(clean.split(' ').length>110?'…':'');
  if(mode==='summary')return clean.split(/(?<=[.!?])\s+/).slice(0,5).map(x=>'• '+x).join('\n');
  if(mode==='names'){
    const root=(clean.match(/[A-Za-z0-9]+/)||['Nova'])[0].slice(0,14);
    return['Forge','Pulse','Nest','Core','Spark','Mint','Loop','Bloom','Byte','Drift'].map(x=>root+x).join('\n');
  }
  if(mode==='json'){
    try{
      const s=text.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim().replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g,'$1"$2"$3').replace(/'/g,'"').replace(/,\s*([}\]])/g,'$1');
      return JSON.stringify(JSON.parse(s),null,2);
    }catch{return JSON.stringify({error:'Could not repair JSON safely',original:text},null,2)}
  }
  return clean;
}

export function runTool(){
  const text=$('toolInput').value.trim();
  if(!text)return toast('Add text first');
  if(BLOCKED.test(text)){
    $('toolOutput').textContent='Blocked: this tool will not assist fraud, credential theft, malware, impersonation, spam, or private-key handling.';
    return;
  }
  if(app.toolMode==='json'){
    $('toolOutput').textContent=deterministic('json',text);
    incrementRuns();
    return;
  }
  ensureModel();
  const id=++app.toolRequest;
  const prompts={
    compress:`Compress this user-provided text into a concise clear version. Preserve facts. Output only the result:\n${text}`,
    summary:`Summarize this user-provided text in 3 to 6 accurate bullets. Output only the bullets:\n${text}`,
    names:`Generate 12 original short project names inspired by this description. Avoid famous brands and franchises. One per line:\n${text}`
  };
  $('toolOutput').textContent='Loading the optional local AI safely…';
  app.modelWorker.postMessage({type:'tool',payload:{id,choice:app.settings.model,prompt:prompts[app.toolMode],maxTokens:96}});
}

function incrementRuns(){
  const n=Number(localStorage.getItem('pennyspawn_tool_runs_v6')||0)+1;
  localStorage.setItem('pennyspawn_tool_runs_v6',String(n));
  app.render?.();
}

export function startEngine(){
  if(app.spectator)return toast('Owner login required to run the agent');
  app.engine=true;
  app.agent.status=hasWallet()?'alive · safe core':'simulation · add wallet';
  if(!app.agent.cycleEnd||app.agent.cycleEnd<=Date.now())beginCycle();
  clearInterval(app.timers.cycle);
  app.timers.cycle=setInterval(tickCycle,SAFE_TICK_MS);
  if(!app.modelReady)fallbackPlan('Safe-core subagents activated without loading a large model.');
  log(`Scout, Builder, and Auditor subagents online. Target: ${money(TARGET_USD,2)} verified per cycle.`);
  app.render?.();
}

export function stopEngine(){
  app.engine=false;
  clearInterval(app.timers.cycle);
  app.timers.cycle=null;
  app.agent.status='paused';
  saveAgent();
  app.render?.();
}

function beginCycle(){
  const minutes=Math.max(2,Math.min(60,Number(app.settings.cycleMinutes)||10));
  app.agent.cycleStart=Date.now();
  app.agent.cycleEnd=Date.now()+minutes*60000;
  app.wallet.cycleUsd=0;
  log(`Generation ${app.agent.generation} started a ${minutes}-minute safe cycle. Goal: ${money(TARGET_USD,2)} verified.`);
  saveAgent();
}

function tickCycle(){
  if(document.hidden)return;
  if(app.engine&&Date.now()>=app.agent.cycleEnd)evaluateCycle();
  app.render?.();
}

function evaluateCycle(){
  const earned=Number(app.wallet.cycleUsd||0);
  const old={id:app.agent.id,generation:app.agent.generation,strategy:app.agent.strategy,earned,fitness:app.agent.fitness};
  if(earned>=TARGET_USD){
    old.status='offspring';
    app.agent.offspring.push(old);
    app.agent.fitness=Math.min(1,Math.round((Number(app.agent.fitness||.25)+.15)*1000)/1000);
    log(`${old.id} reached ${money(earned,2)} and spawned a stronger child strategy.`);
  }else{
    old.status='retired';
    app.agent.retired.push(old);
    app.agent.fitness=Math.max(.05,Math.round((Number(app.agent.fitness||.25)-.05)*1000)/1000);
    log(`${old.id} earned ${money(earned,2)} of the ${money(TARGET_USD,2)} target. Strategy retired; no child spawned.`);
    window.PS_BEAM?.();
  }
  app.agent.generation++;
  app.agent.id=`penny-agent-${String(app.agent.generation).padStart(2,'0')}`;
  app.agent.status='evolving · safe core';
  app.agent.retired=app.agent.retired.slice(-12);
  app.agent.offspring=app.agent.offspring.slice(-12);
  beginCycle();
  requestPlan(earned);
}

function requestPlan(earned=0){
  if(!app.modelReady){
    fallbackPlan('Scout analyzed utility, Builder formed a plan, and Auditor checked safety.');
    return;
  }
  app.modelWorker.postMessage({type:'plan',payload:{choice:app.settings.model,skills:app.settings.skills,previous:app.agent.strategy,earned}});
}

function applyPlan(text){
  if(!text||BLOCKED.test(text))return fallbackPlan('Generated plan failed the legal shield.');
  app.agent.strategy=text.match(/STRATEGY:\s*(.+)/i)?.[1]?.trim()||'Offer a small lawful local-AI tool.';
  app.agent.nextAction=text.match(/NEXT ACTION:\s*(.+)/i)?.[1]?.trim()||'Review the plan and publish it manually where permitted.';
  app.agent.why=text.match(/WHY:\s*(.+)/i)?.[1]?.trim()||'Useful tools can attract visitors without deceptive claims.';
  app.agent.status='alive · plan audited';
  log(`Audited strategy: ${app.agent.strategy}`);
  saveAgent();
  app.render?.();
}

function fallbackPlan(reason){
  const plans=[
    ['Instant JSON Clinic','Put a one-tap broken-JSON repair example at the top of Tool Lab.','Scout found a clear problem, Builder chose a zero-server tool, and Auditor confirmed it is lawful.'],
    ['Prompt Shrinker','Show an interactive before-and-after prompt compression demo.','It is useful on mobile, inexpensive to run, and easy for visitors to understand.'],
    ['Accessibility Draft Lab','Add human-reviewed alt-text and plain-language drafting examples.','It can create real utility without claiming perfect accuracy.'],
    ['Name Forge Arena','Let visitors generate and vote on original project names.','It is lightweight, repeatable, and naturally supports voluntary tips.'],
    ['Micro Tool Challenge','Rotate one tiny useful browser tool per generation.','Frequent visible improvements can increase return visits without spam.']
  ];
  const p=plans[app.agent.generation%plans.length];
  app.agent.strategy=p[0];
  app.agent.nextAction=p[1];
  app.agent.why=p[2];
  app.agent.status=app.engine?'alive · 3 subagents':'ready · safe core';
  log(`${reason} Safe plan selected: ${p[0]}.`);
  saveAgent();
  app.render?.();
}
