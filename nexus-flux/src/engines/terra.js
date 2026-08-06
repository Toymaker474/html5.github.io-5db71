import { fractalNoise2, clamp } from '../lib/math.js';

export const TERRA_COMPUTE_WGSL = /* wgsl */`
struct Params { time:f32, dt:f32, rain:f32, erosion:f32, evaporation:f32, flow:f32, pointer:vec2f, pointerForce:f32, seed:f32, width:u32, height:u32, pad:vec2f };
@group(0) @binding(0) var inputState: texture_2d<f32>;
@group(0) @binding(1) var outputState: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> params: Params;
fn readState(c: vec2i) -> vec4f {
  let q = clamp(c, vec2i(0), vec2i(i32(params.width)-1, i32(params.height)-1));
  return textureLoad(inputState, q, 0);
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1,311.7)) + params.seed) * 43758.5453); }
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let c = vec2i(gid.xy); let s = readState(c);
  let left = readState(c + vec2i(-1,0)); let right = readState(c + vec2i(1,0));
  let up = readState(c + vec2i(0,-1)); let down = readState(c + vec2i(0,1));
  let surface = s.r + s.g;
  let neighborSurface = vec4f(left.r+left.g, right.r+right.g, up.r+up.g, down.r+down.g);
  let outflow = dot(max(vec4f(surface)-neighborSurface, vec4f(0.0)), vec4f(0.25)) * params.flow;
  let inflow = max((left.r+left.g)-surface,0.0)*left.g + max((right.r+right.g)-surface,0.0)*right.g + max((up.r+up.g)-surface,0.0)*up.g + max((down.r+down.g)-surface,0.0)*down.g;
  inflow = inflow * 0.12 * params.flow;
  let uv = vec2f(gid.xy) / vec2f(params.width, params.height);
  let pointerDelta = (uv-params.pointer)*vec2f(f32(params.width)/f32(params.height),1.0);
  let pointerRain = exp(-dot(pointerDelta, pointerDelta)*160.0) * params.pointerForce;
  let rainfall = params.rain * (0.45 + 0.9*hash(vec2f(gid.xy)+floor(params.time*7.0))) + pointerRain;
  var water = max(0.0, s.g + (rainfall + inflow - outflow) * params.dt - s.g * params.evaporation * params.dt);
  let gradient = vec2f(right.r-left.r, down.r-up.r) * 0.5;
  let slope = length(gradient);
  let capacity = water * slope * 5.0;
  var sediment = s.b;
  var height = s.r;
  if (sediment < capacity) {
    let amount = min(height, (capacity-sediment) * params.erosion * params.dt);
    height = height - amount; sediment = sediment + amount;
  } else {
    let amount = (sediment-capacity) * 0.22 * params.dt;
    height = height + amount; sediment = max(0.0, sediment-amount);
  }
  let moisture = clamp(mix(s.a, water + rainfall*0.4, 0.08), 0.0, 1.0);
  textureStore(outputState, c, vec4f(clamp(height,0.0,1.5), clamp(water,0.0,1.5), clamp(sediment,0.0,1.0), moisture));
}`;

export const TERRA_RENDER_WGSL = /* wgsl */`
struct Params { time:f32, dt:f32, rain:f32, erosion:f32, evaporation:f32, flow:f32, pointer:vec2f, pointerForce:f32, seed:f32, width:u32, height:u32, pad:vec2f };
@group(0) @binding(0) var stateTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32) -> Out {
  let p = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3)); var out:Out; out.position=vec4f(p[i],0,1); out.uv=p[i]*0.5+0.5; return out;
}
fn read(c:vec2i)->vec4f { return textureLoad(stateTexture, clamp(c,vec2i(0),vec2i(i32(params.width)-1,i32(params.height)-1)),0); }
@fragment fn fs(input:Out)->@location(0) vec4f {
  let c=vec2i(input.uv*vec2f(params.width,params.height)); let s=read(c);
  let dx=read(c+vec2i(1,0)).r-read(c+vec2i(-1,0)).r; let dy=read(c+vec2i(0,1)).r-read(c+vec2i(0,-1)).r;
  let normal=normalize(vec3f(-dx*18.0, 1.0, -dy*18.0)); let light=normalize(vec3f(-0.35,0.8,0.45)); let lit=0.35+0.75*max(dot(normal,light),0.0);
  let sand=vec3f(0.46,0.24,0.08); let grass=vec3f(0.06,0.28,0.12); let rock=vec3f(0.24,0.25,0.29); let snow=vec3f(0.8,0.9,1.0);
  var terrain=mix(sand,grass,smoothstep(0.18,0.42,s.r)*s.a); terrain=mix(terrain,rock,smoothstep(0.52,0.78,s.r)); terrain=mix(terrain,snow,smoothstep(0.9,1.15,s.r));
  let waterColor=vec3f(0.01,0.19,0.42)+vec3f(0.0,0.35,0.42)*pow(max(dot(reflect(-light,normal),vec3f(0,1,0)),0.0),12.0);
  let waterMask=smoothstep(0.002,0.045,s.g); let color=mix(terrain*lit,waterColor*(0.65+lit*0.55),waterMask);
  let fog=smoothstep(0.0,1.0,input.uv.y)*0.08; return vec4f(color+vec3f(0.02,0.05,0.09)*fog,1.0);
}`;

function initialState(width,height,seed){ const data=new Float32Array(width*height*4); for(let y=0;y<height;y++)for(let x=0;x<width;x++){const u=x/(width-1),v=y/(height-1); const n=fractalNoise2(u*4,v*4,{seed,octaves:6}); const ridge=Math.abs(fractalNoise2(u*2.2+7,v*2.2-3,{seed:seed+11,octaves:4})-0.5)*2; const h=clamp(0.08+n*0.75+ridge*0.28-(Math.hypot(u-0.5,v-0.52)*0.18),0,1.25); const i=(y*width+x)*4; data[i]=h; data[i+1]=0; data[i+2]=0; data[i+3]=clamp(1-h*0.55,0,1);} return data; }
function writeParams(buffer,v){const d=new DataView(buffer); const fs=['time','dt','rain','erosion','evaporation','flow','pointerX','pointerY','pointerForce','seed']; fs.forEach((k,i)=>d.setFloat32(i*4,v[k],true)); d.setUint32(40,v.width,true);d.setUint32(44,v.height,true);}

export class TerraEngine {
  constructor({size=192,seed=91}={}){this.width=size;this.height=size;this.seed=seed;this.time=0;this.pointer=[0.5,0.5];this.pointerForce=0;this.index=0;}
  async initGpu(gpu){this.gpu=gpu; const usage=GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_DST; this.textures=[0,1].map(i=>gpu.device.createTexture({label:`terra-${i}`,size:[this.width,this.height],format:'rgba32float',usage})); this.views=this.textures.map(t=>t.createView()); const seed=initialState(this.width,this.height,this.seed); gpu.device.queue.writeTexture({texture:this.textures[0]},seed,{bytesPerRow:this.width*16},{width:this.width,height:this.height}); gpu.device.queue.writeTexture({texture:this.textures[1]},seed,{bytesPerRow:this.width*16},{width:this.width,height:this.height}); this.params=gpu.buffer('terra-params',64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST); this.compute=await gpu.computePipeline('terra-compute',TERRA_COMPUTE_WGSL); this.render=await gpu.renderPipeline('terra-render',TERRA_RENDER_WGSL); this.computeBinds=[0,1].map(i=>gpu.device.createBindGroup({layout:this.compute.getBindGroupLayout(0),entries:[{binding:0,resource:this.views[i]},{binding:1,resource:this.views[1-i]},{binding:2,resource:{buffer:this.params}}]})); this.renderBinds=[0,1].map(i=>gpu.device.createBindGroup({layout:this.render.getBindGroupLayout(0),entries:[{binding:0,resource:this.views[i]},{binding:1,resource:{buffer:this.params}}]}));}
  initCpu(canvas){this.canvas=canvas;this.context=canvas.getContext('2d',{alpha:false});this.cpu=initialState(96,96,this.seed);this.cpuSize=96;this.image=this.context.createImageData(96,96);this.cpuCanvas=document.createElement('canvas');this.cpuCanvas.width=96;this.cpuCanvas.height=96;this.cpuContext=this.cpuCanvas.getContext('2d');}
  pointerAt(x,y,force=2.5){this.pointer=[x,y];this.pointerForce=force;} releasePointer(){this.pointerForce=0;}
  updateGpu(dt,encoder,targetView){this.time+=dt; const raw=new ArrayBuffer(64);writeParams(raw,{time:this.time,dt:Math.min(dt,0.033),rain:0.018,erosion:0.72,evaporation:0.08,flow:1.25,pointerX:this.pointer[0],pointerY:this.pointer[1],pointerForce:this.pointerForce,seed:this.seed,width:this.width,height:this.height});this.gpu.device.queue.writeBuffer(this.params,0,raw);const cp=encoder.beginComputePass();cp.setPipeline(this.compute);cp.setBindGroup(0,this.computeBinds[this.index]);cp.dispatchWorkgroups(Math.ceil(this.width/8),Math.ceil(this.height/8));cp.end();this.index=1-this.index;const rp=encoder.beginRenderPass({colorAttachments:[{view:targetView,clearValue:{r:0.01,g:0.02,b:0.04,a:1},loadOp:'clear',storeOp:'store'}]});rp.setPipeline(this.render);rp.setBindGroup(0,this.renderBinds[this.index]);rp.draw(3);rp.end();}
  updateCpu(dt){this.time+=dt;const n=this.cpuSize,src=this.cpu,dst=new Float32Array(src.length);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=(y*n+x)*4;const h=src[i],w=src[i+1],s=src[i+2];const idx=(xx,yy)=>(Math.max(0,Math.min(n-1,yy))*n+Math.max(0,Math.min(n-1,xx)))*4;const l=idx(x-1,y),r=idx(x+1,y),u=idx(x,y-1),d=idx(x,y+1);const surface=h+w;const ns=[src[l]+src[l+1],src[r]+src[r+1],src[u]+src[u+1],src[d]+src[d+1]];const out=ns.reduce((a,v)=>a+Math.max(0,surface-v),0)*0.18;let water=Math.max(0,w+(0.012-out-w*0.04)*dt);const slope=Math.hypot(src[r]-src[l],src[d]-src[u])*.5;const cap=water*slope*4;let height=h,sed=s;if(sed<cap){const a=Math.min(height,(cap-sed)*0.55*dt);height-=a;sed+=a}else{const a=(sed-cap)*0.16*dt;height+=a;sed-=a}dst[i]=height;dst[i+1]=water;dst[i+2]=sed;dst[i+3]=clamp(src[i+3]*0.98+water*0.1,0,1);}this.cpu=dst;const p=this.image.data;for(let i=0,j=0;i<dst.length;i+=4,j+=4){const h=dst[i],w=dst[i+1],m=dst[i+3];let rr=40+140*h,gg=30+110*m+80*h,bb=20+40*h;if(w>.008){rr=5;gg=75+Math.min(100,w*1500);bb=130+Math.min(120,w*1800)}p[j]=rr;p[j+1]=gg;p[j+2]=bb;p[j+3]=255;}this.context.imageSmoothingEnabled=true;this.cpuContext.putImageData(this.image,0,0);this.context.drawImage(this.cpuCanvas,0,0,this.canvas.width,this.canvas.height);}
  contract(){return{schema:'nexus.flux.engine.v1',name:'TERRA',capabilities:['gpu-compute','hydraulic-erosion','touch-rain'],inputs:['pointer','time'],outputs:['terrain-frame'],parameters:{grid:this.width}};}
}
