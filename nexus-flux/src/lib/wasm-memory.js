const PAGE_BYTES = 65536;
const TYPES = new Map([
  ['f32', Float32Array],
  ['f64', Float64Array],
  ['i32', Int32Array],
  ['u32', Uint32Array],
]);

const alignUp = (value, alignment) => Math.ceil(value / alignment) * alignment;

export class WasmMemoryArena {
  constructor({ initialPages = 1, maximumPages = 64 } = {}) {
    if (!Number.isInteger(initialPages) || initialPages < 1) throw new Error('WASM_MEMORY_INVALID_INITIAL');
    if (!Number.isInteger(maximumPages) || maximumPages < initialPages || maximumPages > 4096) throw new Error('WASM_MEMORY_INVALID_MAXIMUM');
    this.memory = new WebAssembly.Memory({ initial: initialPages, maximum: maximumPages });
    this.maximumPages = maximumPages;
    this.cursor = 0;
    this.entries = new Map();
  }

  ensureCapacity(requiredBytes) {
    if (!Number.isSafeInteger(requiredBytes) || requiredBytes < 0) throw new Error('WASM_MEMORY_INVALID_SIZE');
    if (requiredBytes <= this.memory.buffer.byteLength) return;
    const requiredPages = Math.ceil(requiredBytes / PAGE_BYTES);
    const currentPages = this.memory.buffer.byteLength / PAGE_BYTES;
    const growth = requiredPages - currentPages;
    if (requiredPages > this.maximumPages) throw new Error('WASM_MEMORY_BUDGET_EXCEEDED');
    try {
      this.memory.grow(growth);
    } catch (error) {
      throw Object.assign(new Error('WASM_MEMORY_GROW_FAILED'), { cause: error });
    }
    this.refreshViews();
  }

  allocate(name, { scalar = 'f64', elements, components = 1 } = {}) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(name)) throw new Error('WASM_MEMORY_INVALID_NAME');
    if (this.entries.has(name)) throw new Error('WASM_MEMORY_DUPLICATE_NAME');
    const Type = TYPES.get(scalar);
    if (!Type) throw new Error('WASM_MEMORY_UNSUPPORTED_SCALAR');
    if (!Number.isInteger(elements) || elements < 1) throw new Error('WASM_MEMORY_INVALID_ELEMENTS');
    if (!Number.isInteger(components) || components < 1 || elements % components !== 0) throw new Error('WASM_MEMORY_INVALID_COMPONENTS');
    const byteOffset = alignUp(this.cursor, Type.BYTES_PER_ELEMENT);
    const byteLength = elements * Type.BYTES_PER_ELEMENT;
    this.ensureCapacity(byteOffset + byteLength);
    const entry = { name, scalar, elements, components, byteOffset, byteLength, Type, view: null };
    this.entries.set(name, entry);
    this.cursor = byteOffset + byteLength;
    this.refreshEntry(entry);
    return entry.view;
  }

  refreshEntry(entry) {
    entry.view = new entry.Type(this.memory.buffer, entry.byteOffset, entry.elements);
    return entry.view;
  }

  refreshViews() {
    for (const entry of this.entries.values()) this.refreshEntry(entry);
    return this;
  }

  view(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error('WASM_MEMORY_UNKNOWN_ARRAY');
    if (entry.view.buffer !== this.memory.buffer) this.refreshEntry(entry);
    return entry.view;
  }

  contract() {
    return {
      schema: 'nexus.flux.wasm-memory.v1',
      pageBytes: PAGE_BYTES,
      pages: this.memory.buffer.byteLength / PAGE_BYTES,
      maximumPages: this.maximumPages,
      usedBytes: this.cursor,
      arrays: Object.fromEntries([...this.entries].map(([name, entry]) => [name, {
        scalar: entry.scalar,
        elements: entry.elements,
        components: entry.components,
        byteOffset: entry.byteOffset,
        byteLength: entry.byteLength,
      }])),
    };
  }
}

export class NBodyWasmBridge {
  constructor(count, options = {}) {
    if (!Number.isInteger(count) || count < 1 || count > 4096) throw new Error('NBODY_WASM_INVALID_COUNT');
    this.count = count;
    this.arena = new WasmMemoryArena(options);
    this.arena.allocate('mass', { scalar: 'f64', elements: count, components: 1 });
    this.arena.allocate('position', { scalar: 'f64', elements: count * 3, components: 3 });
    this.arena.allocate('velocity', { scalar: 'f64', elements: count * 3, components: 3 });
    this.arena.allocate('acceleration', { scalar: 'f64', elements: count * 3, components: 3 });
  }

  assertCompatible(system) {
    if (!system || system.count !== this.count) throw new Error('NBODY_WASM_INCOMPATIBLE_SYSTEM');
  }

  push(system) {
    this.assertCompatible(system);
    this.arena.view('mass').set(system.mass);
    this.arena.view('position').set(system.position);
    this.arena.view('velocity').set(system.velocity);
    this.arena.view('acceleration').set(system.acceleration);
    return this;
  }

  pull(system) {
    this.assertCompatible(system);
    system.mass.set(this.arena.view('mass'));
    system.position.set(this.arena.view('position'));
    system.velocity.set(this.arena.view('velocity'));
    system.acceleration.set(this.arena.view('acceleration'));
    return system;
  }

  contract() {
    return {
      schema: 'nexus.flux.nbody-wasm-bridge.v1',
      count: this.count,
      memory: this.arena.contract(),
      ownership: 'javascript-managed-webassembly-memory',
      nativeKernelAttached: false,
    };
  }
}
