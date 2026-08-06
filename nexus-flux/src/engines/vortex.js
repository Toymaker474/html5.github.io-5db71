import { DeterministicRng } from '../tools/deterministic-rng.js';
import { taylorGreenVelocity } from '../lib/math.js';
import { additiveBlend } from '../lib/renderer.js';

export const VORTEX_COMPUTE_WGSL = /* wgsl */`
struct Particle { position: vec2f, velocity: vec2f, age: f32, seed: f32, pad: vec2f };
struct Params { time: f32, dt: f32, strength: f32, damping: f32, pointer: vec2f, pointerForce: f32, count: u32, aspect: f32, pointSize: f32, pad: vec2f };
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;
const TAU = 6.28318530718;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) { return; }
  var p = particles[i];
  let phase = params.time * 0.035;
  let field = vec2f(
    sin(TAU * (p.position.x + phase)) * cos(TAU * p.position.y),
    -cos(TAU * p.position.x) * sin(TAU * (p.position.y + phase))
  ) * params.strength;
  var delta = p.position - params.pointer;
  delta.x *= params.aspect;
  let distance2 = max(dot(delta, delta), 0.0002);
  let tangent = normalize(vec2f(-delta.y, delta.x));
  let pointerFlow = tangent * params.pointerForce * exp(-distance2 * 38.0);
  p.velocity = p.velocity * params.damping + (field + pointerFlow) * params.dt;
  p.position = fract(p.position + p.velocity * params.dt);
  p.age = p.age + params.dt;
  particles[i] = p;
}`;

export const VORTEX_RENDER_WGSL = /* wgsl */`
struct Particle { position: vec2f, velocity: vec2f, age: f32, seed: f32, pad: vec2f };
struct Params { time: f32, dt: f32, strength: f32, damping: f32, pointer: vec2f, pointerForce: f32, count: u32, aspect: f32, pointSize: f32, pad: vec2f };
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;
struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) color: vec3f };
@vertex fn vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Out {
  let corners = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  let p = particles[instance];
  let corner = corners[vertex];
  let size = params.pointSize * (0.72 + 0.55 * p.seed);
  let offset = vec2f(corner.x * size / params.aspect, corner.y * size);
  var out: Out;
  out.position = vec4f((p.position * 2.0 - 1.0) + offset, 0.0, 1.0);
  out.uv = corner;
  let speed = min(length(p.velocity) * 5.0, 1.0);
  out.color = mix(vec3f(0.04, 0.35, 1.3), vec3f(1.4, 0.12, 0.65), speed) + vec3f(0.0, 0.45 * p.seed, 0.25);
  return out;
}
@fragment fn fs(input: Out) -> @location(0) vec4f {
  let radius = length(input.uv);
  let alpha = (1.0 - smoothstep(0.05, 1.0, radius)) * 0.36;
  let glow = exp(-radius * radius * 3.2);
  return vec4f(input.color * glow, alpha);
}`;

function makeParticleData(count, seed = 7) {
  const rng = new DeterministicRng(seed); const data = new Float32Array(count * 8);
  for (let i = 0; i < count; i += 1) {
    const offset = i * 8; data[offset] = rng.next(); data[offset + 1] = rng.next();
    data[offset + 2] = 0; data[offset + 3] = 0; data[offset + 4] = rng.range(0, 20); data[offset + 5] = rng.next();
  }
  return data;
}
function writeParams(buffer, values) {
  const view = new DataView(buffer);
  ['time','dt','strength','damping','pointerX','pointerY','pointerForce'].forEach((key, i) => view.setFloat32(i * 4, values[key], true));
  view.setUint32(28, values.count, true); view.setFloat32(32, values.aspect, true); view.setFloat32(36, values.pointSize, true);
}

export class VortexEngine {
  constructor({ count = 48000, seed = 7 } = {}) { this.count = count; this.seed = seed; this.time = 0; this.pointer = [0.5, 0.5]; this.pointerForce = 0; this.cpu = null; }
  async initGpu(gpu) {
    this.gpu = gpu; const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.particles = gpu.buffer('vortex-particles', makeParticleData(this.count, this.seed), usage);
    this.params = gpu.buffer('vortex-params', 48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.compute = await gpu.computePipeline('vortex-compute', VORTEX_COMPUTE_WGSL);
    this.render = await gpu.renderPipeline('vortex-render', VORTEX_RENDER_WGSL, { blend: additiveBlend });
    this.computeBind = gpu.device.createBindGroup({ layout: this.compute.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particles } }, { binding: 1, resource: { buffer: this.params } }] });
    this.renderBind = gpu.device.createBindGroup({ layout: this.render.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.particles } }, { binding: 1, resource: { buffer: this.params } }] });
  }
  initCpu(canvas) { this.canvas = canvas; this.context = canvas.getContext('2d', { alpha: false, desynchronized: true }); this.cpu = makeParticleData(Math.min(this.count, 5000), this.seed); }
  pointerAt(x, y, force = 6) { this.pointer = [x, y]; this.pointerForce = force; }
  releasePointer() { this.pointerForce = 0; }
  updateGpu(dt, encoder, targetView) {
    this.time += dt; const aspect = this.gpu.canvas.width / this.gpu.canvas.height; const raw = new ArrayBuffer(48);
    writeParams(raw, { time: this.time, dt: Math.min(dt, 0.033), strength: 1.15, damping: 0.985, pointerX: this.pointer[0], pointerY: 1 - this.pointer[1], pointerForce: this.pointerForce, count: this.count, aspect, pointSize: 0.0055 });
    this.gpu.device.queue.writeBuffer(this.params, 0, raw);
    const computePass = encoder.beginComputePass(); computePass.setPipeline(this.compute); computePass.setBindGroup(0, this.computeBind); computePass.dispatchWorkgroups(Math.ceil(this.count / 128)); computePass.end();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: targetView, clearValue: { r: 0.003, g: 0.006, b: 0.02, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
    pass.setPipeline(this.render); pass.setBindGroup(0, this.renderBind); pass.draw(6, this.count); pass.end();
  }
  updateCpu(dt) {
    this.time += dt; const ctx = this.context, width = this.canvas.width, height = this.canvas.height;
    ctx.fillStyle = 'rgba(1,3,12,.22)'; ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.cpu.length; i += 8) {
      let x = this.cpu[i], y = this.cpu[i + 1], vx = this.cpu[i + 2], vy = this.cpu[i + 3];
      const [fx, fy] = taylorGreenVelocity(x, y, this.time, 1.1); const dx = (x - this.pointer[0]) * width / height, dy = y - this.pointer[1]; const d2 = Math.max(dx * dx + dy * dy, 0.0002); const f = this.pointerForce * Math.exp(-d2 * 35);
      vx = vx * 0.985 + (fx - dy / Math.sqrt(d2) * f) * dt; vy = vy * 0.985 + (fy + dx / Math.sqrt(d2) * f) * dt;
      x = (x + vx * dt + 1) % 1; y = (y + vy * dt + 1) % 1; this.cpu[i] = x; this.cpu[i + 1] = y; this.cpu[i + 2] = vx; this.cpu[i + 3] = vy;
      const speed = Math.min(1, Math.hypot(vx, vy) * 4); ctx.fillStyle = `hsla(${210 + speed * 110},100%,65%,.28)`; ctx.fillRect(x * width, (1 - y) * height, 1.5, 1.5);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  contract() { return { schema: 'nexus.flux.engine.v1', name: 'VORTEX', capabilities: ['gpu-compute','particle-flow','touch-force'], inputs: ['pointer','time'], outputs: ['frame'], parameters: { count: this.count } }; }
}
