// SPDX-License-Identifier: MIT

const FIELD_NAMES = Object.freeze([
  'velocityX', 'velocityY', 'velocityXNext', 'velocityYNext',
  'pressure', 'pressureNext', 'divergence', 'curl',
  'red', 'green', 'blue', 'redNext', 'greenNext', 'blueNext',
]);

const align64 = value => (value + 63) & ~63;

export class WasmFluidEngine {
  constructor(compilation, options = {}) {
    this.compilation = compilation;
    this.exports = compilation.instance.exports;
    this.memory = this.exports.memory;
    this.width = Number(options.width ?? 160);
    this.height = Number(options.height ?? this.width);
    this.length = this.width * this.height;
    this.config = {
      timestep: Number(options.timestep ?? 0.72),
      pressureIterations: Number(options.pressureIterations ?? 16),
      vorticity: Number(options.vorticity ?? 24),
      decay: Number(options.decay ?? 0.996),
      velocityDecay: Number(options.velocityDecay ?? 0.999),
      radius: Number(options.radius ?? 0.055),
      substeps: Number(options.substeps ?? 1),
    };
    if (!Number.isInteger(this.width) || !Number.isInteger(this.height) || this.width < 32 || this.height < 32 || this.width > 256 || this.height > 256) {
      throw Object.assign(new Error('Fluid grid must be integer dimensions from 32 to 256.'), { code: 'FLUID_GRID_INVALID' });
    }
    this.layout = this.#allocateFields();
    this.frame = 0;
    this.lastStepMs = 0;
    this.clear();
  }

  #allocateFields() {
    const fieldBytes = align64(this.length * Float32Array.BYTES_PER_ELEMENT);
    const layout = {};
    let offset = 0;
    for (const name of FIELD_NAMES) {
      layout[name] = offset;
      offset += fieldBytes;
    }
    const requiredBytes = offset;
    if (requiredBytes > 16 * 1024 * 1024) throw Object.assign(new Error('Fluid field layout exceeds the 16 MB kernel maximum.'), { code: 'FLUID_MEMORY_BUDGET' });
    if (this.memory.buffer.byteLength < requiredBytes) {
      const missing = requiredBytes - this.memory.buffer.byteLength;
      const pages = Math.ceil(missing / 65536);
      this.memory.grow(pages);
    }
    layout.fieldBytes = fieldBytes;
    layout.requiredBytes = requiredBytes;
    return Object.freeze(layout);
  }

  pointer(name) {
    const value = this.layout[name];
    if (!Number.isInteger(value)) throw new Error(`Unknown fluid field '${name}'.`);
    return value;
  }

  view(name) {
    return new Float32Array(this.memory.buffer, this.pointer(name), this.length);
  }

  clear() {
    for (const name of FIELD_NAMES) this.exports.clear(this.pointer(name), this.length);
    this.frame = 0;
  }

  #swap(a, b) {
    const mutable = { ...this.layout, [a]: this.layout[b], [b]: this.layout[a] };
    this.layout = Object.freeze(mutable);
  }

  #project() {
    const e = this.exports;
    const w = this.width;
    const h = this.height;
    e.divergence(this.pointer('divergence'), this.pointer('velocityX'), this.pointer('velocityY'), w, h);
    e.clear(this.pointer('pressure'), this.length);
    e.clear(this.pointer('pressureNext'), this.length);
    let source = this.pointer('pressure');
    let destination = this.pointer('pressureNext');
    for (let iteration = 0; iteration < this.config.pressureIterations; iteration += 1) {
      e.pressureJacobi(destination, source, this.pointer('divergence'), w, h);
      [source, destination] = [destination, source];
    }
    e.subtractGradient(this.pointer('velocityX'), this.pointer('velocityY'), source, w, h);
  }

  step() {
    const started = performance.now();
    const e = this.exports;
    const w = this.width;
    const h = this.height;
    const dt = this.config.timestep / this.config.substeps;

    for (let substep = 0; substep < this.config.substeps; substep += 1) {
      e.curl(this.pointer('curl'), this.pointer('velocityX'), this.pointer('velocityY'), w, h);
      e.vorticity(
        this.pointer('velocityX'), this.pointer('velocityY'), this.pointer('curl'),
        w, h, this.config.vorticity, dt,
      );

      e.advect(
        this.pointer('velocityXNext'), this.pointer('velocityX'),
        this.pointer('velocityX'), this.pointer('velocityY'), w, h, dt,
      );
      e.advect(
        this.pointer('velocityYNext'), this.pointer('velocityY'),
        this.pointer('velocityX'), this.pointer('velocityY'), w, h, dt,
      );
      this.#swap('velocityX', 'velocityXNext');
      this.#swap('velocityY', 'velocityYNext');
      this.#project();

      e.advect(this.pointer('redNext'), this.pointer('red'), this.pointer('velocityX'), this.pointer('velocityY'), w, h, dt);
      e.advect(this.pointer('greenNext'), this.pointer('green'), this.pointer('velocityX'), this.pointer('velocityY'), w, h, dt);
      e.advect(this.pointer('blueNext'), this.pointer('blue'), this.pointer('velocityX'), this.pointer('velocityY'), w, h, dt);
      this.#swap('red', 'redNext');
      this.#swap('green', 'greenNext');
      this.#swap('blue', 'blueNext');

      e.scale(this.pointer('velocityX'), this.length, this.config.velocityDecay);
      e.scale(this.pointer('velocityY'), this.length, this.config.velocityDecay);
      e.scale(this.pointer('red'), this.length, this.config.decay);
      e.scale(this.pointer('green'), this.length, this.config.decay);
      e.scale(this.pointer('blue'), this.length, this.config.decay);
    }

    this.frame += 1;
    this.lastStepMs = performance.now() - started;
    return this.metrics();
  }

  splat({ x, y, forceX = 0, forceY = 0, radius = this.config.radius, color = [1, 0.2, 0.8] }) {
    const cx = Math.max(0, Math.min(1, Number(x))) * (this.width - 1);
    const cy = Math.max(0, Math.min(1, Number(y))) * (this.height - 1);
    const gridRadius = Math.max(1.5, Number(radius) * Math.min(this.width, this.height));
    this.exports.splat(
      this.pointer('velocityX'), this.pointer('velocityY'),
      this.pointer('red'), this.pointer('green'), this.pointer('blue'),
      this.width, this.height, cx, cy,
      Number(forceX), Number(forceY), gridRadius,
      Number(color[0] ?? 0), Number(color[1] ?? 0), Number(color[2] ?? 0),
    );
  }

  seedWhirlpool({ turns = 22, strength = 4.8, radius = 0.29 } = {}) {
    const palette = [
      [0.08, 1.0, 1.8],
      [1.45, 0.12, 1.7],
      [0.18, 0.55, 2.0],
      [1.9, 0.45, 0.08],
    ];
    for (let index = 0; index < turns; index += 1) {
      const angle = (index / turns) * Math.PI * 2;
      const wobble = 0.78 + 0.22 * Math.sin(index * 2.399963);
      const px = 0.5 + Math.cos(angle) * radius * wobble;
      const py = 0.5 + Math.sin(angle) * radius * wobble;
      const tangentX = -Math.sin(angle) * strength;
      const tangentY = Math.cos(angle) * strength;
      this.splat({ x: px, y: py, forceX: tangentX, forceY: tangentY, radius: 0.045, color: palette[index % palette.length] });
    }
    this.splat({ x: 0.5, y: 0.5, forceX: 0, forceY: 0, radius: 0.07, color: [1.6, 0.8, 0.16] });
  }

  snapshot() {
    const fields = {};
    for (const name of ['velocityX', 'velocityY', 'red', 'green', 'blue']) fields[name] = this.view(name).slice();
    return { schema: 'nexus.fluid.snapshot.v1', width: this.width, height: this.height, frame: this.frame, fields };
  }

  restore(snapshot) {
    if (snapshot?.width !== this.width || snapshot?.height !== this.height) throw new Error('Snapshot dimensions do not match this engine.');
    for (const name of ['velocityX', 'velocityY', 'red', 'green', 'blue']) this.view(name).set(snapshot.fields[name]);
    this.frame = Number(snapshot.frame ?? 0);
  }

  metrics() {
    const kineticEnergy = this.exports.energy(this.pointer('velocityX'), this.pointer('velocityY'), this.length);
    const red = this.view('red');
    const green = this.view('green');
    const blue = this.view('blue');
    let dye = 0;
    let gradient = 0;
    for (let y = 0; y < this.height; y += 2) {
      for (let x = 0; x < this.width; x += 2) {
        const index = y * this.width + x;
        dye += red[index] + green[index] + blue[index];
        if (x + 1 < this.width) {
          const right = index + 1;
          gradient += Math.abs(red[index] - red[right]) + Math.abs(green[index] - green[right]) + Math.abs(blue[index] - blue[right]);
        }
      }
    }
    return {
      schema: 'nexus.fluid.metrics.v1',
      frame: this.frame,
      grid: `${this.width}×${this.height}`,
      kineticEnergy,
      sampledDyeMass: dye,
      sampledColorGradient: gradient,
      stepMilliseconds: this.lastStepMs,
    };
  }

  async benchmark(iterations = 12) {
    const snapshot = this.snapshot();
    const timings = [];
    for (let index = 0; index < iterations; index += 1) {
      const started = performance.now();
      this.step();
      timings.push(performance.now() - started);
    }
    const metrics = this.metrics();
    this.restore(snapshot);
    timings.sort((a, b) => a - b);
    const average = timings.reduce((sum, value) => sum + value, 0) / timings.length;
    return {
      schema: 'nexus.fluid.benchmark.v1',
      iterations,
      averageMilliseconds: average,
      medianMilliseconds: timings[Math.floor(timings.length / 2)],
      minimumMilliseconds: timings[0],
      maximumMilliseconds: timings.at(-1),
      finalMetrics: metrics,
    };
  }

  exportState() {
    const encode = field => Array.from(this.view(field));
    return {
      schema: 'nexus.fluid.state.v1',
      width: this.width,
      height: this.height,
      frame: this.frame,
      config: { ...this.config },
      fields: {
        velocityX: encode('velocityX'), velocityY: encode('velocityY'),
        red: encode('red'), green: encode('green'), blue: encode('blue'),
      },
    };
  }
}
