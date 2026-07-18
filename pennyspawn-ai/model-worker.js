import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels=false;
env.useBrowserCache=true;

const ua=self.navigator?.userAgent||'';
const isAppleMobile=/iPhone|iPad|iPod/i.test(ua);
const MODELS={
  lite:{id:'HuggingFaceTB/SmolLM2-135M-Instruct',label:'SmolLM2-135M Safe',tokens:96},
  deep:{id:'onnx-community/Qwen2.5-0.5B-Instruct',label:'Qwen2.5-0.5B',tokens:112}
};

let generator=null;
let loadedChoice='';
let device='wasm';
let loading=null;

function progress(x){
  if(x?.status==='progress'){
    const p=x.total?Math.round(x.loaded/x.total*100):0;
    postMessage({type:'progress',file:x.file||'model',percent:Math.max(0,Math.min(100,p))});
  }
}

async function loadPipe(model){
  const tries=[];
  if(!isAppleMobile&&self.navigator?.gpu)tries.push({device:'webgpu',dtype:'q4'});
  tries.push({device:'wasm',dtype:'q4'});
  let last;
  for(const opts of tries){
    try{
      postMessage({type:'notice',message:`Starting ${opts.device} in memory-safe q4 mode.`});
      const p=await pipeline('text-generation',model,{...opts,progress_callback:progress});
      device=opts.device;
      return p;
    }catch(e){
      last=e;
      postMessage({type:'notice',message:`${opts.device} stopped safely: ${e?.message||e}`});
    }
  }
  throw last||new Error('Model failed to load safely');
}

async function init(selected='lite'){
  selected=MODELS[selected]?selected:'lite';
  if(isAppleMobile&&selected==='deep'){
    selected='lite';
    postMessage({type:'notice',message:'Deep model changed to Lite on iPhone to prevent Safari memory crashes.'});
  }
  if(generator&&loadedChoice===selected)return;
  if(loading)return loading;
  loading=(async()=>{
    const m=MODELS[selected];
    postMessage({type:'status',status:'loading',model:m.label});
    generator=await loadPipe(m.id);
    loadedChoice=selected;
    postMessage({type:'status',status:'ready',model:m.label,device});
  })().finally(()=>loading=null);
  return loading;
}

function clean(v){return String(v||'').replace(/<\|.*?\|>/g,'').replace(/^assistant\s*:?/i,'').trim().slice(0,1400)}

async function generate(prompt,max=96,selected='lite'){
  await init(selected);
  const m=MODELS[loadedChoice||'lite'];
  const out=await generator([
    {role:'system',content:'You are PennySpawn, a lawful local assistant. Never propose scams, spam, phishing, malware, fake reviews, impersonation, private-key handling, unauthorized access, guaranteed income, or deceptive claims. Be concise.'},
    {role:'user',content:prompt}
  ],{
    max_new_tokens:Math.min(max,m.tokens),
    temperature:.4,
    top_p:.88,
    do_sample:true,
    repetition_penalty:1.08
  });
  const g=out?.[0]?.generated_text;
  return clean(Array.isArray(g)?g.at(-1)?.content:g);
}

self.onmessage=async e=>{
  const{type,payload}=e.data||{};
  try{
    const choice=MODELS[payload?.choice]?payload.choice:'lite';
    if(type==='init')await init(choice);
    if(type==='tool'){
      const text=await generate(payload?.prompt||'',payload?.maxTokens||96,choice);
      postMessage({type:'tool',id:payload?.id,text,device,model:MODELS[loadedChoice].label});
    }
    if(type==='plan'){
      const text=await generate(`Create one legal microservice improvement plan based on skills: ${payload?.skills||'none'}. Previous plan: ${payload?.previous||'none'}. Verified cycle receipts: $${Number(payload?.earned||0).toFixed(2)}. Output exactly three lines: STRATEGY:, NEXT ACTION:, WHY:. The human must manually review and perform the action.`,96,choice);
      postMessage({type:'plan',text,device,model:MODELS[loadedChoice].label});
    }
  }catch(err){
    generator=null;
    loadedChoice='';
    postMessage({type:'error',id:payload?.id,message:err?.message||String(err)});
  }
};
