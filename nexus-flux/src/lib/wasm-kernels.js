const encodeU32 = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('WASM_BINARY_INVALID_U32');
  const bytes = [];
  do {
    let byte = value & 0x7f;
    value = Math.floor(value / 128);
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return bytes;
};

const encodeString = value => {
  const bytes = [...new TextEncoder().encode(value)];
  return [...encodeU32(bytes.length), ...bytes];
};

const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];

function buildF64AxpyWasmBinary(exportName) {
  const typeSection = section(1, [
    ...encodeU32(1),
    0x60,
    ...encodeU32(4), 0x7f, 0x7f, 0x7f, 0x7c,
    ...encodeU32(0),
  ]);
  const importSection = section(2, [
    ...encodeU32(1),
    ...encodeString('env'),
    ...encodeString('memory'),
    0x02,
    0x00, ...encodeU32(1),
  ]);
  const functionSection = section(3, [...encodeU32(1), ...encodeU32(0)]);
  const exportSection = section(7, [
    ...encodeU32(1),
    ...encodeString(exportName),
    0x00, ...encodeU32(0),
  ]);
  const instructions = [
    0x41, 0x00, 0x21, 0x04,
    0x02, 0x40,
    0x03, 0x40,
    0x20, 0x04, 0x20, 0x02, 0x4f, 0x0d, 0x01,
    0x20, 0x00, 0x20, 0x04, 0x41, 0x03, 0x74, 0x6a, 0x21, 0x05,
    0x20, 0x05,
    0x20, 0x05, 0x2b, 0x03, 0x00,
    0x20, 0x01, 0x20, 0x04, 0x41, 0x03, 0x74, 0x6a, 0x2b, 0x03, 0x00,
    0x20, 0x03, 0xa2, 0xa0,
    0x39, 0x03, 0x00,
    0x20, 0x04, 0x41, 0x01, 0x6a, 0x21, 0x04,
    0x0c, 0x00,
    0x0b,
    0x0b,
    0x0b,
  ];
  const functionBody = [
    ...encodeU32(1),
    ...encodeU32(2), 0x7f,
    ...instructions,
  ];
  const codeSection = section(10, [
    ...encodeU32(1),
    ...encodeU32(functionBody.length),
    ...functionBody,
  ]);
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...typeSection,
    ...importSection,
    ...functionSection,
    ...exportSection,
    ...codeSection,
  ]);
}

export function buildNBodyKickWasmBinary() {
  return buildF64AxpyWasmBinary('nbodyKick');
}

export function buildNBodyDriftWasmBinary() {
  return buildF64AxpyWasmBinary('nbodyDrift');
}

class NBodyAxpyWasmKernel {
  constructor({ arena, instance, module, byteLength, exportName, targetName, sourceName, schema, operation }) {
    this.arena = arena;
    this.instance = instance;
    this.module = module;
    this.byteLength = byteLength;
    this.exportName = exportName;
    this.targetName = targetName;
    this.sourceName = sourceName;
    this.schema = schema;
    this.operation = operation;
  }

  apply(dt, scalarCount = this.arena.view(this.targetName).length) {
    if (!Number.isFinite(dt)) throw new Error('NBODY_WASM_KERNEL_INVALID_DT');
    if (!Number.isInteger(scalarCount) || scalarCount < 0) throw new Error('NBODY_WASM_KERNEL_INVALID_COUNT');
    const layout = this.arena.contract().arrays;
    const target = layout[this.targetName];
    const source = layout[this.sourceName];
    if (!target || !source || target.scalar !== 'f64' || source.scalar !== 'f64') throw new Error('NBODY_WASM_KERNEL_LAYOUT_MISMATCH');
    if (scalarCount > target.elements || scalarCount > source.elements) throw new Error('NBODY_WASM_KERNEL_RANGE');
    this.instance.exports[this.exportName](target.byteOffset, source.byteOffset, scalarCount, dt);
    return this.arena.view(this.targetName);
  }

  contract() {
    return {
      schema: this.schema,
      operation: this.operation,
      scalar: 'f64',
      nativeKernelAttached: true,
      binaryBytes: this.byteLength,
      importedMemory: true,
      deterministic: true,
    };
  }
}

async function instantiateKernel(arena, { binary, exportName, targetName, sourceName, schema, operation, KernelClass }) {
  if (!arena?.memory || !(arena.memory instanceof WebAssembly.Memory)) throw new Error('NBODY_WASM_KERNEL_INVALID_ARENA');
  if (!WebAssembly.validate(binary)) throw new Error('NBODY_WASM_KERNEL_BINARY_INVALID');
  const { instance, module } = await WebAssembly.instantiate(binary, { env: { memory: arena.memory } });
  if (!(instance.exports[exportName] instanceof Function)) throw new Error('NBODY_WASM_KERNEL_EXPORT_MISSING');
  return new KernelClass({ arena, instance, module, byteLength: binary.byteLength, exportName, targetName, sourceName, schema, operation });
}

export class NBodyKickWasmKernel extends NBodyAxpyWasmKernel {
  static async create(arena) {
    return instantiateKernel(arena, {
      binary: buildNBodyKickWasmBinary(),
      exportName: 'nbodyKick',
      targetName: 'velocity',
      sourceName: 'acceleration',
      schema: 'nexus.flux.nbody-wasm-kernel.v1',
      operation: 'velocity += acceleration * dt',
      KernelClass: NBodyKickWasmKernel,
    });
  }

  kick(dt, scalarCount) {
    return this.apply(dt, scalarCount ?? this.arena.view('velocity').length);
  }
}

export class NBodyDriftWasmKernel extends NBodyAxpyWasmKernel {
  static async create(arena) {
    return instantiateKernel(arena, {
      binary: buildNBodyDriftWasmBinary(),
      exportName: 'nbodyDrift',
      targetName: 'position',
      sourceName: 'velocity',
      schema: 'nexus.flux.nbody-wasm-drift-kernel.v1',
      operation: 'position += velocity * dt',
      KernelClass: NBodyDriftWasmKernel,
    });
  }

  drift(dt, scalarCount) {
    return this.apply(dt, scalarCount ?? this.arena.view('position').length);
  }
}
