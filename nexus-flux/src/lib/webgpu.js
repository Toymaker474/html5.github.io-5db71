import { validateShaderModule } from '../tools/shader-linter.js';
export class FluxGpuContext {
  static async create(canvas, { alphaMode = 'premultiplied', powerPreference = 'high-performance' } = {}) {
    if (!navigator.gpu) throw Object.assign(new Error('WEBGPU_UNAVAILABLE'), { code: 'WEBGPU_UNAVAILABLE' });
    const adapter = await navigator.gpu.requestAdapter({ powerPreference });
    if (!adapter) throw Object.assign(new Error('WEBGPU_NO_ADAPTER'), { code: 'WEBGPU_NO_ADAPTER' });
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) {
      device.destroy();
      throw Object.assign(new Error('WEBGPU_CANVAS_CONTEXT_UNAVAILABLE'), { code: 'WEBGPU_CANVAS_CONTEXT_UNAVAILABLE' });
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    try {
      context.configure({ device, format, alphaMode });
    } catch (error) {
      device.destroy();
      throw Object.assign(new Error(`WEBGPU_CANVAS_CONFIGURE_FAILED:${String(error?.message || error)}`), { code: 'WEBGPU_CANVAS_CONFIGURE_FAILED', cause: error });
    }
    return new FluxGpuContext({ canvas, adapter, device, context, format });
  }
  constructor({ canvas, adapter, device, context, format }) { this.canvas = canvas; this.adapter = adapter; this.device = device; this.context = context; this.format = format; this.resources = new Set(); }
  buffer(label, dataOrBytes, usage) {
    const bytes = typeof dataOrBytes === 'number' ? dataOrBytes : dataOrBytes.byteLength;
    const buffer = this.device.createBuffer({ label, size: Math.ceil(bytes / 4) * 4, usage, mappedAtCreation: typeof dataOrBytes !== 'number' });
    if (typeof dataOrBytes !== 'number') { new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(dataOrBytes.buffer, dataOrBytes.byteOffset, dataOrBytes.byteLength)); buffer.unmap(); }
    this.resources.add(buffer); return buffer;
  }
  write(buffer, data, offset = 0) { this.device.queue.writeBuffer(buffer, offset, data.buffer, data.byteOffset, data.byteLength); }
  async computePipeline(label, code, entryPoint = 'main') {
    const { module } = await validateShaderModule(this.device, code);
    return this.device.createComputePipelineAsync({ label, layout: 'auto', compute: { module, entryPoint } });
  }
  async renderPipeline(label, code, { vertex = 'vs', fragment = 'fs', topology = 'triangle-list', blend } = {}) {
    const { module } = await validateShaderModule(this.device, code);
    return this.device.createRenderPipelineAsync({ label, layout: 'auto', vertex: { module, entryPoint: vertex }, fragment: { module, entryPoint: fragment, targets: [{ format: this.format, blend }] }, primitive: { topology } });
  }
  resize(width, height) { if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; } }
  destroy() { for (const resource of this.resources) resource.destroy?.(); this.resources.clear(); this.device.destroy(); }
}
