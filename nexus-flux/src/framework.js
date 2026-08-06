import { profileCapabilities, chooseGrid } from './tools/capability-profiler.js';
import { AdaptiveQuality } from './tools/adaptive-quality.js';
import { FluxProfiler } from './tools/profiler.js';
import { FluxGpuContext } from './lib/webgpu.js';
import { resizeCanvas } from './lib/renderer.js';
import { VortexEngine } from './engines/vortex.js';
import { TerraEngine } from './engines/terra.js';

export function replaceCanvasForCpu(canvas) {
  if (!canvas?.cloneNode || !canvas?.replaceWith) throw new Error('CPU_CANVAS_REPLACEMENT_UNAVAILABLE');
  const replacement = canvas.cloneNode(false);
  replacement.width = Math.max(2, canvas.width || 2);
  replacement.height = Math.max(2, canvas.height || 2);
  canvas.replaceWith(replacement);
  return replacement;
}

export class FluxWorld {
  constructor(canvas,{mode='vortex'}={}){this.canvas=canvas;this.mode=mode;this.running=false;this.quality=new AdaptiveQuality({targetMs:16.7,initialScale:.8});this.profiler=new FluxProfiler();this.engines={};this.last=0;}
  async init(){
    this.capabilities=await profileCapabilities();
    const viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio||1};
    const grid=chooseGrid(this.capabilities,viewport);
    this.engines.vortex=new VortexEngine({count:this.capabilities.webgpu?Math.round(grid*grid*1.2):5000});
    this.engines.terra=new TerraEngine({size:this.capabilities.webgpu?grid:96});
    let gpuAttempted=false;
    let gpuCandidate=null;
    try{
      if(!this.capabilities.webgpu)throw new Error('WEBGPU_UNAVAILABLE_USE_CPU');
      gpuAttempted=true;
      gpuCandidate=await FluxGpuContext.create(this.canvas);
      await this.engines.vortex.initGpu(gpuCandidate);
      await this.engines.terra.initGpu(gpuCandidate);
      this.gpu=gpuCandidate;
      this.backend='webgpu';
    }catch(gpuError){
      this.fallbackReason=String(gpuError?.message||gpuError);
      try{gpuCandidate?.destroy();}catch{}
      this.gpu=null;
      this.backend='recovering';
      if(gpuAttempted)this.canvas=replaceCanvasForCpu(this.canvas);
      try{
        this.engines.vortex.initCpu(this.canvas);
        this.engines.terra.initCpu(this.canvas);
        this.backend='cpu';
      }catch(cpuError){
        const failure=new Error(`GPU_INIT_FAILED:${this.fallbackReason};CPU_RECOVERY_FAILED:${String(cpuError?.message||cpuError)}`);
        failure.cause={gpuError,cpuError};
        throw failure;
      }
    }
    this.bindInput();
    this.running=true;
    requestAnimationFrame(t=>this.frame(t));
    return this.report();
  }
  bindInput(){const point=e=>{const r=this.canvas.getBoundingClientRect();return[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]};this.canvas.addEventListener('pointerdown',e=>{this.canvas.setPointerCapture(e.pointerId);this.engines[this.mode].pointerAt(...point(e),this.mode==='vortex'?8:3)});this.canvas.addEventListener('pointermove',e=>{if(e.buttons)this.engines[this.mode].pointerAt(...point(e),this.mode==='vortex'?8:3)});for(const name of ['pointerup','pointercancel'])this.canvas.addEventListener(name,()=>this.engines[this.mode].releasePointer());}
  setMode(mode){if(!this.engines[mode])throw new Error(`ENGINE_UNKNOWN:${mode}`);this.engines[this.mode].releasePointer();this.mode=mode;}
  frame(time){if(!this.running)return;const dt=Math.min(.033,Math.max(.001,(time-this.last)/1000||.016));this.last=time;const start=performance.now();const size=resizeCanvas(this.canvas,this.backend==='webgpu'?this.quality.scale:0.72);if(this.backend==='webgpu'){this.gpu.resize(size.width,size.height);const encoder=this.gpu.device.createCommandEncoder();this.engines[this.mode].updateGpu(dt,encoder,this.gpu.context.getCurrentTexture().createView());this.gpu.device.queue.submit([encoder.finish()]);}else this.engines[this.mode].updateCpu(dt);const ms=performance.now()-start;this.profiler.frame(ms);this.quality.push(ms);this.onStats?.(this.report());requestAnimationFrame(t=>this.frame(t));}
  report(){return{schema:'nexus.flux.runtime.v1',backend:this.backend??'starting',mode:this.mode,capabilities:this.capabilities??null,performance:this.profiler.stats(),qualityScale:this.quality.scale,fallbackReason:this.fallbackReason??null,engines:Object.values(this.engines).map(e=>e.contract())};}
}
