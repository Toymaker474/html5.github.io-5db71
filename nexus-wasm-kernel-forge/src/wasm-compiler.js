// SPDX-License-Identifier: MIT

const textEncoder = new TextEncoder();

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function compileWat({ source, filename = 'kernel.wat', requiredExports = [], wabtFactory = globalThis.WabtModule }) {
  if (typeof source !== 'string' || !source.trim()) throw Object.assign(new Error('WAT source is required.'), { code: 'WAT_EMPTY' });
  if (textEncoder.encode(source).byteLength > 250_000) throw Object.assign(new Error('WAT source exceeds the 250 KB Generation One budget.'), { code: 'WAT_SOURCE_TOO_LARGE' });
  if (typeof wabtFactory !== 'function') throw Object.assign(new Error('WABT compiler is unavailable.'), { code: 'WABT_UNAVAILABLE' });

  const wabt = await wabtFactory();
  let parsed;
  try {
    parsed = wabt.parseWat(filename, source, {
      bulk_memory: true,
      mutable_globals: true,
      multi_value: true,
      sign_extension: true,
      sat_float_to_int: true,
      simd: false,
      threads: false,
      exceptions: false,
      memory64: false,
    });
    parsed.resolveNames();
    parsed.validate();
    const binary = parsed.toBinary({ log: true, canonicalize_lebs: true, relocatable: false, write_debug_names: true });
    const bytes = new Uint8Array(binary.buffer);
    if (bytes.byteLength > 350_000) throw Object.assign(new Error('Compiled WASM exceeds the 350 KB Generation One budget.'), { code: 'WASM_BINARY_TOO_LARGE' });
    if (!WebAssembly.validate(bytes)) throw Object.assign(new Error('The browser rejected the compiled WASM binary.'), { code: 'WASM_BROWSER_INVALID' });

    const module = await WebAssembly.compile(bytes);
    const imports = WebAssembly.Module.imports(module);
    const exports = WebAssembly.Module.exports(module);
    if (imports.length) {
      const names = imports.map(item => `${item.module}.${item.name}:${item.kind}`).join(', ');
      throw Object.assign(new Error(`Generation One kernels may not import host capabilities: ${names}`), { code: 'WASM_IMPORT_BLOCKED', imports });
    }
    const exportNames = new Set(exports.map(item => item.name));
    const missing = requiredExports.filter(name => !exportNames.has(name));
    if (missing.length) throw Object.assign(new Error(`Kernel is missing required exports: ${missing.join(', ')}`), { code: 'WASM_EXPORT_MISSING', missing });

    const instance = await WebAssembly.instantiate(module, {});
    const memory = instance.exports.memory;
    if (!(memory instanceof WebAssembly.Memory)) throw Object.assign(new Error('Kernel did not export WebAssembly.Memory.'), { code: 'WASM_MEMORY_MISSING' });
    if (memory.buffer.byteLength > 32 * 1024 * 1024) throw Object.assign(new Error('Kernel initial memory exceeds 32 MB.'), { code: 'WASM_MEMORY_BUDGET' });

    return Object.freeze({
      schema: 'nexus.wasm.compilation.v1',
      source,
      bytes,
      module,
      instance,
      imports,
      exports,
      compilerLog: binary.log,
      sha256: await sha256(bytes),
      byteLength: bytes.byteLength,
    });
  } catch (cause) {
    if (cause?.code) throw cause;
    const error = new Error(cause?.message || 'WAT compilation failed.');
    error.code = 'WAT_COMPILE_FAILED';
    error.cause = cause;
    throw error;
  } finally {
    parsed?.destroy?.();
  }
}

export function downloadBinary(bytes, filename = 'nexus-kernel.wasm') {
  const blob = new Blob([bytes], { type: 'application/wasm' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function createKernelContract(compilation, metadata = {}) {
  return {
    schema: 'nexus.ai-kernel-contract.v1',
    id: metadata.id ?? 'nexus-fluid2d-wasm',
    version: metadata.version ?? '0.1.0',
    purpose: metadata.purpose ?? 'Paper-backed incompressible 2D fluid compute kernel',
    runtime: 'WebAssembly MVP',
    deterministic: true,
    binary: {
      sha256: compilation.sha256,
      bytes: compilation.byteLength,
    },
    capabilities: {
      imports: compilation.imports,
      exports: compilation.exports,
      hostAccess: false,
      initialMemoryBytes: compilation.instance.exports.memory.buffer.byteLength,
    },
    acceptedInputs: metadata.acceptedInputs ?? ['Float32 grid fields', 'integer dimensions', 'bounded scalar parameters'],
    produces: metadata.produces ?? ['velocity fields', 'pressure field', 'curl field', 'RGB dye fields', 'energy metric'],
    limits: metadata.limits ?? { maximumGrid: 256, maximumMemoryBytes: 32 * 1024 * 1024 },
  };
}
