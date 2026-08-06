// SPDX-License-Identifier: MIT

const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function page(spec, body, script, extraStyle = '') {
  const title = escapeHTML(spec.world);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#07111f"><title>${title}</title>
<style>
:root{color-scheme:dark;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050914;color:#edf7ff}body{overscroll-behavior:none}button,input,textarea{font:inherit}button{min-height:44px;border:0;border-radius:14px;padding:.75rem 1rem;background:#89f7ff;color:#031014;font-weight:900}.shell{min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto}.top,.bottom{padding:max(14px,env(safe-area-inset-top)) 16px 14px;background:#091426dd;backdrop-filter:blur(16px)}.bottom{padding:12px 16px max(12px,env(safe-area-inset-bottom));display:flex;gap:10px;flex-wrap:wrap}.top h1{font-size:clamp(1.15rem,5vw,2rem);margin:0}.top p{margin:.35rem 0 0;color:#91a9bd}.stage{position:relative;min-height:0;overflow:hidden}.card{background:#0b1729;border:1px solid #1e3854;border-radius:18px;padding:16px}.status{font-variant-numeric:tabular-nums;color:#a7c8dd}${extraStyle}
</style></head><body><div class="shell"><header class="top"><h1>${title}</h1><p>${escapeHTML(spec.goal)}</p></header><main class="stage">${body}</main><footer class="bottom"><span class="status" id="status">NEXUS Generation One</span></footer></div><script>${script}</script></body></html>`;
}

function appProject(spec) {
  const body = `<section class="app-grid"><div class="card"><h2>Idea board</h2><form id="form"><input id="idea" maxlength="120" placeholder="Add a real item" required><button>Add</button></form><div id="items"></div></div><div class="card"><h2>Build record</h2><pre id="record"></pre></div></section>`;
  const script = `const key='${spec.slug}:items';let items=JSON.parse(localStorage.getItem(key)||'[]');const list=document.querySelector('#items'),record=document.querySelector('#record');function draw(){list.innerHTML='';items.forEach((x,i)=>{const row=document.createElement('button');row.className='item';row.textContent=(x.done?'✓ ':'○ ')+x.text;row.onclick=()=>{items[i].done=!items[i].done;save()};list.append(row)});record.textContent=JSON.stringify({count:items.length,complete:items.filter(x=>x.done).length,storedLocally:true},null,2)}function save(){localStorage.setItem(key,JSON.stringify(items));draw()}form.onsubmit=e=>{e.preventDefault();items.push({text:idea.value.trim(),done:false});idea.value='';save()};draw();`;
  return page(spec, body, script, `.app-grid{padding:16px;display:grid;gap:14px}.app-grid form{display:flex;gap:8px}.app-grid input{width:100%;min-height:44px;border:1px solid #294763;border-radius:12px;background:#050c18;color:white;padding:10px}.item{display:block;width:100%;margin-top:8px;text-align:left;background:#122842;color:#dff9ff}`);
}

function simulationProject(spec) {
  const body = `<canvas id="world"></canvas><aside class="hud card"><strong>Living Particle Field</strong><label>Gravity <input id="gravity" type="range" min="-0.12" max="0.35" value="0.08" step="0.01"></label><label>Population <input id="population" type="range" min="24" max="260" value="96"></label><button id="burst">Seed energy</button><pre id="metrics"></pre></aside>`;
  const script = `const c=world,x=c.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2);let p=[];function resize(){c.width=innerWidth*dpr;c.height=c.clientHeight*dpr;x.setTransform(dpr,0,0,dpr,0,0)}function make(){return{x:Math.random()*innerWidth,y:Math.random()*c.clientHeight,vx:(Math.random()-.5)*2,vy:(Math.random()-.5)*2,r:2+Math.random()*5,e:60+Math.random()*120,h:160+Math.random()*120}}function sync(){while(p.length<+population.value)p.push(make());p.length=+population.value}function burstAt(px=innerWidth/2,py=c.clientHeight/2){for(const a of p){const dx=a.x-px,dy=a.y-py,q=Math.hypot(dx,dy)||1;if(q<180){a.vx+=dx/q*(180-q)/32;a.vy+=dy/q*(180-q)/32;a.e+=20}}}burst.onclick=()=>burstAt();c.addEventListener('pointerdown',e=>burstAt(e.clientX,e.clientY-c.getBoundingClientRect().top));function frame(t){sync();x.fillStyle='#04091455';x.fillRect(0,0,innerWidth,c.clientHeight);let energy=0;for(const a of p){a.vy+=+gravity.value;a.x+=a.vx;a.y+=a.vy;a.e-=.035;energy+=a.e;if(a.x<a.r||a.x>innerWidth-a.r)a.vx*=-.96;if(a.y<a.r||a.y>c.clientHeight-a.r)a.vy*=-.9;a.x=Math.max(a.r,Math.min(innerWidth-a.r,a.x));a.y=Math.max(a.r,Math.min(c.clientHeight-a.r,a.y));if(a.e<0)Object.assign(a,make());x.beginPath();x.fillStyle='hsl('+a.h+' 90% 65% / .82)';x.arc(a.x,a.y,a.r,0,Math.PI*2);x.fill()}metrics.textContent='particles '+p.length+'\\navg energy '+Math.round(energy/p.length)+'\\nframe '+Math.round(t);requestAnimationFrame(frame)}addEventListener('resize',resize);resize();requestAnimationFrame(frame);`;
  return page(spec, body, script, `#world{width:100%;height:100%;display:block;background:radial-gradient(circle at 50% 30%,#0d2440,#03060d)}.hud{position:absolute;left:12px;right:12px;bottom:12px;display:grid;gap:8px;max-width:440px}.hud label{display:grid;grid-template-columns:90px 1fr;align-items:center}.hud pre{margin:0}`);
}

function gameProject(spec) {
  const body = `<canvas id="game"></canvas><div class="overlay card"><strong>Touch / drag to move</strong><div id="score">score 0</div><button id="restart">Restart</button></div>`;
  const script = `const c=game,x=c.getContext('2d');let player,enemies,score,alive,last;function reset(){player={x:innerWidth/2,y:c.clientHeight*.75,r:16};enemies=[];score=0;alive=true;last=0}function size(){c.width=innerWidth*(devicePixelRatio||1);c.height=c.clientHeight*(devicePixelRatio||1);x.setTransform(devicePixelRatio||1,0,0,devicePixelRatio||1,0,0)}function move(e){const r=c.getBoundingClientRect();player.x=e.clientX-r.left;player.y=e.clientY-r.top}c.addEventListener('pointerdown',move);c.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')move(e)});restart.onclick=reset;function loop(t){x.fillStyle='#030713';x.fillRect(0,0,innerWidth,c.clientHeight);if(alive&&t-last>420){enemies.push({x:12+Math.random()*(innerWidth-24),y:-20,r:8+Math.random()*13,v:1.8+Math.random()*3});last=t}for(const e of enemies){e.y+=e.v;x.beginPath();x.fillStyle='#ff5470';x.arc(e.x,e.y,e.r,0,7);x.fill();if(Math.hypot(e.x-player.x,e.y-player.y)<e.r+player.r)alive=false}enemies=enemies.filter(e=>e.y<c.clientHeight+30);if(alive)score++;x.beginPath();x.fillStyle=alive?'#80ffdb':'#607080';x.arc(player.x,player.y,player.r,0,7);x.fill();document.querySelector('#score').textContent=(alive?'score ':'crashed — score ')+Math.floor(score/10);requestAnimationFrame(loop)}addEventListener('resize',size);size();reset();requestAnimationFrame(loop);`;
  return page(spec, body, script, `#game{width:100%;height:100%;display:block;touch-action:none}.overlay{position:absolute;top:12px;left:12px;right:12px;display:flex;align-items:center;gap:12px;justify-content:space-between}`);
}

function aiProject(spec) {
  const body = `<section class="ai-grid"><div class="card"><h2>Local neural model</h2><p>A real two-input logistic neuron trains in this browser. Tap samples, train, then export learned weights.</p><div class="samples" id="samples"></div><button id="train">Train 500 epochs</button><button id="exportModel">Export weights</button></div><canvas id="field"></canvas><div class="card"><pre id="metrics"></pre></div></section>`;
  const script = `let w=[Math.random()-.5,Math.random()-.5],b=0,epoch=0;const data=[[-.8,-.7,0],[-.7,.6,0],[-.2,-.8,0],[.3,.2,1],[.65,.5,1],[.85,-.1,1]];const sigmoid=z=>1/(1+Math.exp(-z)),predict=(a,b2)=>sigmoid(a*w[0]+b2*w[1]+b);function draw(){const c=field,x=c.getContext('2d');c.width=Math.min(innerWidth-32,500);c.height=280;for(let py=0;py<c.height;py+=8)for(let px=0;px<c.width;px+=8){const a=px/c.width*2-1,q=1-py/c.height*2;x.fillStyle=predict(a,q)>.5?'#24d9a055':'#ff547055';x.fillRect(px,py,8,8)}for(const [a,q,y]of data){x.beginPath();x.fillStyle=y?'#80ffdb':'#ff5470';x.arc((a+1)/2*c.width,(1-q)/2*c.height,7,0,7);x.fill()}samples.innerHTML=data.map((d,i)=>'<button data-i="'+i+'">'+d.map(n=>n.toFixed(1)).join(' / ')+'</button>').join('');metrics.textContent=JSON.stringify({epoch,weights:w.map(n=>+n.toFixed(4)),bias:+b.toFixed(4),predictions:data.map(d=>+predict(d[0],d[1]).toFixed(3))},null,2)}function fit(){for(let e=0;e<500;e++){for(const [a,q,y]of data){const p=predict(a,q),err=p-y;w[0]-=.18*err*a;w[1]-=.18*err*q;b-=.18*err}epoch++}draw()}train.onclick=fit;exportModel.onclick=()=>{const blob=new Blob([JSON.stringify({schema:'nexus.browser-neuron.v1',weights:w,bias:b,epoch},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='model.json';a.click();URL.revokeObjectURL(a.href)};draw();`;
  return page(spec, body, script, `.ai-grid{padding:16px;display:grid;gap:14px}.samples{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.samples button{background:#142942;color:#dff9ff}#field{width:calc(100% - 32px);max-width:500px;margin:auto;border-radius:18px;border:1px solid #1e3854}`);
}

const BUILDERS = { app: appProject, simulation: simulationProject, game: gameProject, ai: aiProject };

export function buildProject(spec, lumenSource) {
  const index = BUILDERS[spec.kind](spec);
  const manifest = {
    schema: 'nexus.generated-project.v1',
    generator: 'NEXUS Product Forge Generation One',
    project: spec,
    runtime: 'standards-based browser',
    dependencies: [],
    evidenceRequired: ['file hashes', 'preview load', 'structural validation'],
  };
  const files = {
    'index.html': index,
    'project.lumen': `${lumenSource.trim()}\n`,
    'nexus-project.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'README.md': `# ${spec.world}\n\n${spec.goal}\n\nGenerated by NEXUS Product Forge Generation One. Open index.html in a modern browser.\n`,
    'tests/smoke.mjs': `import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';const html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/<!doctype html>/i);assert.match(html,/${spec.world.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/);assert.match(html,/NEXUS Generation One/);console.log('generated project smoke test passed');\n`,
    'package.json': `${JSON.stringify({ name: spec.slug, version: '0.1.0', private: true, type: 'module', scripts: { test: 'node tests/smoke.mjs' } }, null, 2)}\n`,
  };
  return { spec, files };
}
