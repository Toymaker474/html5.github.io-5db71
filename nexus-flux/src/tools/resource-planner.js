const align = (value, multiple = 256) => Math.ceil(value / multiple) * multiple;

export class ResourcePlanner {
  constructor({ byteBudget = 96 * 1024 * 1024 } = {}) { this.byteBudget = byteBudget; this.resources = new Map(); }
  addBuffer(name, { elements, bytesPerElement = 4, copies = 1, usage = 'storage' }) {
    if (this.resources.has(name)) throw new Error(`RESOURCE_DUPLICATE:${name}`);
    const bytes = align(elements * bytesPerElement) * copies;
    this.resources.set(name, { name, type: 'buffer', elements, bytesPerElement, copies, usage, bytes });
    this.assertBudget(); return this;
  }
  addTexture(name, { width, height, channels = 4, bytesPerChannel = 2, copies = 1, usage = 'storage-texture' }) {
    if (this.resources.has(name)) throw new Error(`RESOURCE_DUPLICATE:${name}`);
    const bytes = align(width * height * channels * bytesPerChannel) * copies;
    this.resources.set(name, { name, type: 'texture', width, height, channels, copies, usage, bytes });
    this.assertBudget(); return this;
  }
  totalBytes() { return [...this.resources.values()].reduce((sum, item) => sum + item.bytes, 0); }
  assertBudget() { if (this.totalBytes() > this.byteBudget) throw new Error(`RESOURCE_BUDGET_EXCEEDED:${this.totalBytes()}`); }
  manifest() { return { schema: 'nexus.flux.resources.v1', byteBudget: this.byteBudget, totalBytes: this.totalBytes(), resources: [...this.resources.values()] }; }
}
