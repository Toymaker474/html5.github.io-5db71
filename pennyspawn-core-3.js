function pennyWorkerMain(){
 const corpus={
  pitch:['A clear offer solves one specific problem. Show the result, the proof, the price, and one simple next step.','Make the benefit concrete. Remove hype. Ask for a small commitment.','Lead with the customer problem, explain the deliverable, and close with a direct call to action.'],
  listing:['Name the product clearly. Explain the strongest benefit first. Add practical details, trust signals, and a simple call to action.','Use short sections: title, promise, benefits, specifications, ideal user, and next step.'],
  social:['Open with a strong specific hook. Deliver one useful idea. End with a simple action.','Keep sentences short, honest, and easy to scan.'],
  brief:['State the question, summarize known facts, list uncertainties, and finish with actions.','Separate evidence from assumptions. Prefer useful structure over filler.'],
  reply:['Acknowledge the request, answer directly, explain the next action, and keep the tone respectful.']
 };
 self.onmessage=e=>{
  const {type,task,mode,strategy}=e.data;
  if(type!=='generate')return;
  const pool=corpus[mode]||corpus.reply;
  const focus=(task||'the requested work').trim();
  const base=pool[Math.floor(Math.random()*pool.length)];
  const urgency=strategy.urgency>.55?'Act now while the request is active.':'The next step is simple.';
  const trust=strategy.trust>.55?'Be transparent about scope, timing, and limits.':'';
  let draft='';
  if(mode==='pitch')draft='I can help with '+focus+'. You will receive a focused, reviewed deliverable with clear scope and a fast turnaround. '+urgency+' Reply with the exact goal and deadline.';
  else if(mode==='listing')draft='TITLE: '+focus+'\n\nWHY IT MATTERS: A clear, practical solution designed around the customer’s real need.\n\nKEY BENEFITS:\n• Easy to understand\n• Focused on useful outcomes\n• Reviewed before delivery\n\nNEXT STEP: Confirm the required details and deadline.';
  else if(mode==='social')draft='Stop scrolling: '+focus+'\n\nHere is the useful part: focus on one real problem, show one clear result, and make the next step easy.\n\nSave this and try it on your next project.';
  else if(mode==='brief')draft='QUESTION\n'+focus+'\n\nKNOWN\n• The requested outcome needs a clear definition.\n• Evidence and assumptions should be separated.\n\nOPEN QUESTIONS\n• What is the deadline?\n• What proof is available?\n\nNEXT ACTIONS\n1. Confirm scope.\n2. Gather sources.\n3. Deliver a reviewed summary.';
  else draft='Thanks for the details about '+focus+'. I understand the request. I will keep the scope clear, verify the important parts, and provide the next step without unnecessary delay.';
  self.postMessage({result:'TASK\n'+focus+'\n\nAGENT PLAN\n'+base+'\n'+trust+'\n\nDRAFT\n'+draft});
 };
}
function initWorker(){if(worker)worker.terminate();const source='('+pennyWorkerMain.toString()+')()';worker=new Worker(URL.createObjectURL(new Blob([source],{type:'text/javascript'})))}
function runBrain(){const task=document.getElementById('taskInput').value.trim(),mode=document.getElementById('taskType').value;if(!task)return toast('Describe the task first.');if(!worker)initWorker();document.getElementById('brainOutput').textContent='Local agent thinking…';worker.onmessage=e=>{lastOutput=e.data.result;document.getElementById('brainOutput').textContent=lastOutput;S.energy=Math.max(0,S.energy-1);S.xp+=5;save();renderAll()};worker.onerror=()=>{document.getElementById('brainOutput').textContent='The local worker stopped. Tap Run local agent again.';worker=null;toast('Local worker restarted')};const active=[...S.agents].sort((a,b)=>b.score-a.score)[0];S.activeAgent=active.id;const mixed={...S.strategy,clarity:(S.strategy.clarity+active.genome.clarity)/2,trust:(S.strategy.trust+active.genome.trust)/2,urgency:(S.strategy.urgency+active.genome.conversion)/2};worker.postMessage({type:'generate',task,mode,strategy:mixed})}
function generatePitch(){showView('earn');document.getElementById('taskType').value='pitch';document.getElementById('taskInput').value='Acquire a real customer for a small, useful AI-assisted service worth at least '+fmt(target())+' sats.';runBrain()}
function copyOutput(){if(!lastOutput)return toast('Run the local agent first.');copyText(lastOutput)}
function markAccepted(){if(!lastOutput)return toast('Run the local agent first.');S.accepted++;S.acceptedOutputs=S.acceptedOutputs||[];S.acceptedOutputs.push({text:lastOutput,agent:S.activeAgent||'master',at:Date.now()});S.acceptedOutputs=S.acceptedOutputs.slice(-24);const a=S.agents.find(x=>x.id===(S.activeAgent||'master'));if(a){a.score=Math.min(99,a.score+2);a.status='accepted'}S.xp+=25;log('train','Owner accepted an agent output',(a?.name||'Prime')+' received a training signal');save();renderAll();toast('Accepted as local training signal ✓')}
