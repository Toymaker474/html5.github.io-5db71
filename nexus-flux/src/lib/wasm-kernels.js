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

export function buildNBodyKickWasmBinary() {
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
    ...encodeString('nbodyKick'),
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

export class NBodyKickWasmKernel {
  static async create(arena) {
    if (!arena?.memory || !(arena.memory instanceof WebAssembly.Memory)) throw new Error('NBODY_WASM_KERNEL_INVALID_ARENA');
    const binary = buildNBodyKickWasmBinary();
    if (!WebAssembly.validate(binary)) throw new Error('NBODY_WASM_KERNEL_BINARY_INVALID');
    const { instance, module } = await WebAssembly.instantiate(binary, { env: { memory: arena.memory } });
    return new NBodyKickWasmKernel({ arena, instance, module, byteLength: binary.byteLength });
  }

  constructor({ arena, instance, module, byteLength }) {
    this.arena = arena;
    this.instance = instance;
    this.module = module;
    this.byteLength = byteLength;
  }

  kick(dt, scalarCount = this.arena.view('velocity').length) {
    if (!Number.isFinite(dt)) throw new Error('NBODY_WASM_KERNEL_INVALID_DT');
    if (!Number.isInteger(scalarCount) || scalarCount < 0) throw new Error('NBODY_WASM_KERNEL_INVALID_COUNT');
    const velocity = this.arena.contract().arrays.velocity;
    const acceleration = this.arena.contract().arrays.acceleration;
    if (!velocity || !acceleration || velocity.scalar !== 'f64' || acceleration.scalar !== 'f64') throw new Error('NBODY_WASM_KERNEL_LAYOUT_MISMATCH');
    if (scalarCount > velocity.elements || scalarCount > acceleration.elements) throw new Error('NBODY_WASM_KERNEL_RANGE');
    this.instance.exports.nbodyKick(velocity.byteOffset, acceleration.byteOffset, scalarCount, dt);
    return this.arena.view('velocity');
  }

  contract() {
    return {
      schema: 'nexus.flux.nbody-wasm-kernel.v1',
      operation: 'velocity += acceleration * dt',
      scalar: 'f64',
      nativeKernelAttached: true,
      binaryBytes: this.byteLength,
      importedMemory: true,
      deterministic: true,
    };
  }
}
