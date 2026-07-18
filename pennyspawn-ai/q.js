const $=id=>document.getElementById(id);
const QUARTER_TARGETS=[13,13,12,12],FAIL_FLOOR=5,HOUR_TARGET=50;
const OWNER_USER='tyleroy69';
const OWNER_DIGEST='52ed050f59f7ac0d0ffb806b2da6a61abad8ffb94a4d600bf959284c5ecafc73';
let access='spectator',live=false,poll=null,arenaFx={beam:0,flash:0,particles:[]},raf=0;
function fresh(){return{agent:{id:'agent-demo-01',generation:1,status:'alive',specialty:'compress',strategy:'balanced',fitness:.25,temperature:.45,maxTokens:240,thought:'Scanning legal microservice demand…'},cycle:{number:1,quarterIndex:1,status:'running',revenueCents:0,targetCents:13,jobs:0,remainingSeconds:900,history:[]},hour:{revenueCents:0,targetCents:HOUR_TARGET},offspring:[],archive:[],events:[{t:Date.now(),m:'Watcher AI activated. Demo organism born; no real payment activity.'}]}}
let state=fresh();
function money(c){return'$'+(Number(c||0)/100).toFixed(2)}
function clock(s){s=Math.max(0,Math.floor(s||0));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>$('toast').classList.remove('show'),1700)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function log(m){state.events.unshift({t:Date.now(),m});state.events=state.events.slice(0,60)}
function num(v){return Number(v).toFixed(v<10?4:2).replace(/0+$/,'').replace(/\.$/,'')}
function reportText(){const a=state.agent,c=state.cycle,h=state.hour;return[
'PennySpawn Q-Arena Earnings Report',
'Generated: '+new Date().toLocaleString(),
'',
'Mode: '+(live?'LIVE WORKER':'LOCAL DEMO — NOT REAL MONEY'),
'Agent: '+a.id,
'Generation: '+a.generation,
'Status: '+a.status,
'Quarter: '+c.quarterIndex+' of 4',
'Quarter earned: '+money(c.revenueCents)+' / '+money(c.targetCents),
'Quarter failure floor: '+money(FAIL_FLOOR),
'Hour earned: '+money(h.revenueCents)+' / '+money(h.targetCents),
'Offspring: '+state.offspring.length,
'Terminated generations: '+state.archive.length,
'',
'Targets are not guaranteed earnings.'
].join('\n')}
function render(){const a=state.agent,c=state.cycle,h=state.hour;
  $('topState').textContent=live?'LIVE '+String(a.status).toUpperCase():'DEMO '+String(a.status).toUpperCase();
  $('accessBadge').textContent=access==='owner'?'OWNER MODE':'SPECTATOR';
  $('ownerPanel').classList.toggle('locked',access!=='owner');
  $('modeState').textContent=live?'LIVE WORKER':'LOCAL DEMO';$('modeState').className=live?'mint':'amber';
  $('orbFitness').textContent=num(a.fitness);$('nextFitness').textContent=num(a.fitness*2.5);$('hourMetric').textContent=money(h.targetCents);
  $('agentState').textContent=a.id;$('generationState').textContent=a.generation;$('specialtyState').textContent=a.specialty;$('strategyState').textContent=a.strategy;$('agentStatus').textContent=a.status;$('agentStatus').className=a.status==='alive'?'mint':'red';
  $('thoughtBubble').textContent='“'+a.thought+'”';$('watcherText').textContent='observing '+a.id.toUpperCase();
  $('watcherNarration').textContent=watcherLine();
  $('cycleMoney').textContent=money(c.revenueCents)+' / '+money(c.targetCents);$('hourMoney').textContent=money(h.revenueCents)+' / '+money(h.targetCents);
  $('cycleBar').style.width=Math.min(100,c.revenueCents/Math.max(1,c.targetCents)*100)+'%';$('hourBar').style.width=Math.min(100,h.revenueCents/Math.max(1,h.targetCents)*100)+'%';
  $('geneFitness').textContent=num(a.fitness);$('geneTemp').textContent=Number(a.temperature??.45).toFixed(2);$('geneTokens').textContent=a.maxTokens??240;
  $('quarters').innerHTML=QUARTER_TARGETS.map((t,i)=>{const q=i+1,is=i===c.quarterIndex-1,hist=c.history?.find(x=>x.q===q),rev=is?c.revenueCents:(hist?.revenueCents||0),target=is?c.targetCents:t,status=is?'active':hist?.status||'',p=Math.min(100,rev/Math.max(1,target)*100);return`<article class="quarter ${status}" style="--p:${p}%"><div class="qtop"><b>Q${q}</b><span>${is?clock(c.remainingSeconds):(hist?hist.status.toUpperCase():'15:00')}</span></div><div class="qmoney">${money(rev)}</div><small>floor ${money(FAIL_FLOOR)} · target ${money(target)}</small></article>`}).join('');
  const ancestry=[...state.archive.slice(-3),{...a,current:true},...state.offspring.slice(-4)];$('tree').innerHTML=ancestry.map((n,i)=>`${i?'<span class="arrow">→</span>':''}<article class="node ${n.status==='terminated'?'dead':''}"><b>${escapeHtml(String(n.id).slice(0,20))}</b><small>GEN ${n.generation||'?'} · ${n.current?'ACTIVE':n.status||'$0 spend'}</small></article>`).join('');
  $('log').innerHTML=(state.events||[]).map(e=>`<div class="event"><time>${new Date(e.t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><p>${escapeHtml(e.m)}</p></div>`).join('');
  $('reportPreview').textContent=reportText();
}
function watcherLine(){const c=state.cycle,h=state.hour,a=state.agent;if(a.status!=='alive')return'Watcher AI records the termination and waits for a replacement genome.';if(c.revenueCents<FAIL_FLOOR)return`${a.id} is below the ${money(FAIL_FLOOR)} survival floor. Termination risk is high.`;if(c.revenueCents<c.targetCents)return`${a.id} escaped immediate failure but still needs ${money(c.targetCents-c.revenueCents)} to reproduce this quarter.`;if(h.revenueCents<h.targetCents)return`${a.id} passed this quarter. The hour still needs ${money(h.targetCents-h.revenueCents)}.`;return`${a.id} reached the hour target and qualifies to survive and reproduce.`}
function nextThought(kind){const maps={job:['A paid request settled. Reinforcing the current legal service.','Demand signal detected. Preserving the winning route.','One cent acquired. Recalculating survival probability.'],fail:['Revenue floor missed. Archiving this strategy.','This genome failed the quarter. Preparing replacement.'],mutate:['Changing specialty and token budget for the next trial.','Mutation accepted. Testing a new service strategy.'],success:['Target reached. Packaging a zero-spend offspring genome.','Quarter survived. Passing useful traits to the offspring.']};const list=maps[kind]||maps.job;return list[Math.floor(Math.random()*list.length)]}
function recordQuarter(status){const c=state.cycle;c.history=c.history||[];c.history=c.history.filter(x=>x.q!==c.quarterIndex);c.history.push({q:c.quarterIndex,revenueCents:c.revenueCents,status})}
function spawnOffspring(reason='quarter'){const p=state.agent;const child={id:'offspring-'+String(state.offspring.length+1).padStart(2,'0'),generation:p.generation+1,status:'dormant',fitness:Math.round(p.fitness*2.5*10000)/10000,parentId:p.id,reason};state.offspring.push(child);p.thought=nextThought('success');log(`${p.id} produced ${child.id}. It has $0 spending authority and cannot deploy itself.`);burst('child')}
function mutateAgent(){const old=state.agent;const strategies=['balanced','strict','fast','creative'];const specialties=['compress','summary','json','names','listing'];state.agent={id:'agent-demo-'+String(old.generation+1).padStart(2,'0'),generation:old.generation+1,status:'alive',specialty:specialties[(specialties.indexOf(old.specialty)+1+Math.floor(Math.random()*2))%specialties.length],strategy:strategies[(strategies.indexOf(old.strategy)+1)%strategies.length],fitness:Math.round(old.fitness*2.5*10000)/10000,temperature:Math.min(.85,(old.temperature||.45)+.08),maxTokens:Math.min(480,(old.maxTokens||240)+32),parentId:old.id,thought:nextThought('mutate')};log(`${state.agent.id} activated with mutated traits after watching the prior generation fail.`)}
function terminateAgent(reason){if(state.agent.status!=='alive')return;const old={...state.agent,status:'terminated',reason};state.agent.status='terminated';state.agent.thought='Termination signal received. Archiving final telemetry…';state.archive.push(old);log(`${old.id} TERMINATED: ${reason}. Watcher AI observed the full event.`);fireBeam();render();setTimeout(()=>{mutateAgent();state.cycle.revenueCents=0;state.cycle.jobs=0;state.cycle.remainingSeconds=900;state.cycle.targetCents=QUARTER_TARGETS[state.cycle.quarterIndex-1];render()},1400)}
function evaluateQuarter(){if(live)return toast('Live cycles advance on the private Worker');const c=state.cycle,h=state.hour;if(state.agent.status!=='alive')return toast('Replacement is initializing');if(c.revenueCents<FAIL_FLOOR){recordQuarter('failed');terminateAgent(`quarter revenue ${money(c.revenueCents)} was below the ${money(FAIL_FLOOR)} floor`);advanceCycle(false);return}if(c.revenueCents>=c.targetCents){recordQuarter('passed');spawnOffspring('quarter-target');log(`Quarter ${c.quarterIndex} survived at ${money(c.revenueCents)}.`)}else{recordQuarter('failed');state.agent.thought='Quarter floor passed, but reproduction target missed. Improving strategy.';state.agent.fitness=Math.round(state.agent.fitness*2.5*10000)/10000;state.agent.temperature=Math.min(.85,state.agent.temperature+.04);log(`Quarter ${c.quarterIndex} missed reproduction target but avoided immediate death. Fitness improved.`)}advanceCycle(true);if(c.quarterIndex===1){if(h.revenueCents>=h.targetCents){spawnOffspring('hour-target');h.targetCents=Math.round(h.targetCents*2.5);log(`Hour survived at ${money(h.revenueCents)}. Next target increased ×2.5.`);h.revenueCents=0;c.history=[]}else{const earned=h.revenueCents;h.revenueCents=0;c.history=[];terminateAgent(`hour ended at ${money(earned)}, below ${money(h.targetCents)}`)}}render()}
function advanceCycle(keepRevenue){const c=state.cycle;c.number++;c.quarterIndex=c.quarterIndex%4+1;c.revenueCents=0;c.jobs=0;c.targetCents=QUARTER_TARGETS[c.quarterIndex-1];c.remainingSeconds=900;if(!keepRevenue)state.agent.thought=nextThought('fail')}
function demoJob(){if(live)return toast('Demo controls disabled in live mode');if(state.agent.status!=='alive')return toast('Wait for replacement');state.cycle.revenueCents++;state.cycle.jobs++;state.hour.revenueCents++;state.agent.thought=nextThought('job');log('Demo settled job: +$0.01 simulation only.');burst('job');render()}
function reset(){if(live)return toast('Disconnect to reset demo');state=fresh();arenaFx={beam:0,flash:0,particles:[]};render();toast('Demo organism reset')}
function buildEmail(){const to=$('reportEmail').value.trim();localStorage.setItem('pennyspawn_report_email',to);const subject=encodeURIComponent('PennySpawn Q-Arena earnings report');const body=encodeURIComponent(reportText());location.href=`mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`}
async function copyReport(){try{await navigator.clipboard.writeText(reportText());toast('Report copied')}catch{toast('Copy blocked by browser')}}
async function sha256(s){const data=new TextEncoder().encode(s);const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function login(user,pass){const digest=await sha256(user+':'+pass);if(user===OWNER_USER&&digest===OWNER_DIGEST){access='owner';sessionStorage.setItem('pennyspawn_access','owner');openApp();toast('Owner mode unlocked')}else{$('loginError').textContent='Login not accepted.'}}
function openApp(){document.body.classList.add('app-open');$('loginGate').classList.add('hidden');$('appShell').setAttribute('aria-hidden','false');render();resizeArena()}
function spectator(){access='spectator';sessionStorage.setItem('pennyspawn_access','spectator');openApp()}
function logout(){sessionStorage.removeItem('pennyspawn_access');$('loginPass').value='';$('loginError').textContent='';$('loginGate').classList.remove('hidden');$('appShell').setAttribute('aria-hidden','true')}
async function connect(){const base=$('workerUrl').value.trim().replace(/\/$/,'');if(!/^https:\/\//i.test(base))return toast('Use an HTTPS Worker URL');try{const r=await fetch(base+'/api/public/status',{cache:'no-store'});if(!r.ok)throw new Error('status '+r.status);const s=await r.json();live=true;state.agent={...s.agent,temperature:s.agent.temperature??.45,maxTokens:s.agent.maxTokens??240,thought:'Receiving live Worker telemetry…'};state.cycle={...s.cycle,history:s.cycle.history||[]};state.hour=s.hour;state.offspring=s.latestOffspring?[s.latestOffspring]:[];state.events=[{t:Date.now(),m:'Connected to live private Worker.'}];render();clearInterval(poll);poll=setInterval(connect,15000);localStorage.setItem('pennyspawn_q_worker',base)}catch(e){live=false;clearInterval(poll);poll=null;log('Connection failed: '+e.message);render();toast('Worker not reachable')}}

const canvas=$('arena'),ctx=canvas.getContext('2d');let dpr=1;
function resizeArena(){const r=canvas.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0)}
function burst(kind){const r=canvas.getBoundingClientRect(),x=r.width*.5,y=r.height*.55;for(let i=0;i<18;i++){const a=Math.random()*Math.PI*2,s=1+Math.random()*3;arenaFx.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,kind})}}
function fireBeam(){arenaFx.beam=1;arenaFx.flash=1;burst('dead')}
function drawArena(){const r=canvas.getBoundingClientRect(),w=r.width,h=r.height,t=performance.now()/1000;ctx.clearRect(0,0,w,h);ctx.save();
  const grd=ctx.createRadialGradient(w*.5,h*.52,10,w*.5,h*.52,Math.max(w,h)*.6);grd.addColorStop(0,'rgba(75,255,160,.10)');grd.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(115,255,176,.08)';ctx.lineWidth=1;for(let i=1;i<6;i++){ctx.beginPath();ctx.arc(w*.5,h*.55,i*34+Math.sin(t+i)*2,0,Math.PI*2);ctx.stroke()}
  const watcher={x:w*.82,y:h*.22};ctx.fillStyle='rgba(102,220,255,.14)';ctx.beginPath();ctx.arc(watcher.x,watcher.y,25+Math.sin(t*2)*2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(102,220,255,.8)';ctx.stroke();ctx.fillStyle='#9eeaff';ctx.beginPath();ctx.arc(watcher.x,watcher.y,7,0,Math.PI*2);ctx.fill();
  state.offspring.slice(-5).forEach((o,i)=>{const a=(i/Math.max(1,state.offspring.slice(-5).length))*Math.PI*2+t*.08,x=w*.5+Math.cos(a)*105,y=h*.56+Math.sin(a)*70;ctx.fillStyle='rgba(102,220,255,.75)';ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill()});
  const x=w*.5,y=h*.55,alive=state.agent.status==='alive';ctx.shadowBlur=30;ctx.shadowColor=alive?'#73ffb0':'#ff728e';ctx.fillStyle=alive?'rgba(115,255,176,.88)':'rgba(255,114,142,.35)';ctx.beginPath();ctx.arc(x,y,34+Math.sin(t*2.4)*2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#041009';ctx.font='900 14px -apple-system';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('AI',x,y);
  if(arenaFx.beam>0){const sx=w*.12,sy=h*.2;ctx.strokeStyle=`rgba(255,114,142,${arenaFx.beam})`;ctx.lineWidth=5;ctx.shadowBlur=24;ctx.shadowColor='#ff728e';ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(x,y);ctx.stroke();ctx.shadowBlur=0;arenaFx.beam=Math.max(0,arenaFx.beam-.035)}
  if(arenaFx.flash>0){ctx.fillStyle=`rgba(255,114,142,${arenaFx.flash*.18})`;ctx.fillRect(0,0,w,h);arenaFx.flash=Math.max(0,arenaFx.flash-.05)}
  arenaFx.particles=arenaFx.particles.filter(p=>p.life>0);arenaFx.particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.015;p.life-=.018;ctx.fillStyle=p.kind==='dead'?`rgba(255,114,142,${p.life})`:`rgba(102,220,255,${p.life})`;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill()});
  ctx.restore();raf=requestAnimationFrame(drawArena)}

$('loginForm').addEventListener('submit',e=>{e.preventDefault();login($('loginUser').value.trim(),$('loginPass').value)});$('spectatorBtn').onclick=spectator;$('logoutBtn').onclick=logout;
$('jobBtn').onclick=demoJob;$('advanceBtn').onclick=evaluateQuarter;$('terminateBtn').onclick=()=>terminateAgent('owner-requested visual test');$('resetBtn').onclick=reset;
$('saveBtn').onclick=()=>{localStorage.setItem('pennyspawn_q_worker',$('workerUrl').value.trim().replace(/\/$/,''));toast('Worker URL saved')};$('connectBtn').onclick=connect;$('emailBtn').onclick=buildEmail;$('copyReportBtn').onclick=copyReport;
$('reportEmail').value=localStorage.getItem('pennyspawn_report_email')||'';const saved=localStorage.getItem('pennyspawn_q_worker')||'';$('workerUrl').value=saved;
window.addEventListener('resize',resizeArena);resizeArena();drawArena();render();
const remembered=sessionStorage.getItem('pennyspawn_access');if(remembered==='owner'){access='owner';openApp()}else if(remembered==='spectator')spectator();
setInterval(()=>{if(!live&&state.agent.status==='alive'&&state.cycle.remainingSeconds>0){state.cycle.remainingSeconds--;if(state.cycle.remainingSeconds===0)evaluateQuarter();render()}},1000);
