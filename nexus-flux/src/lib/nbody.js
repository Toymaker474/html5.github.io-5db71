const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new Error(`NBODY_INVALID_${name}`);
  return value;
};

export class NBodySystem {
  constructor({ count, gravitationalConstant = 1, softening = 1e-3 } = {}) {
    if (!Number.isInteger(count) || count < 1 || count > 4096) throw new Error('NBODY_INVALID_COUNT');
    if (!(gravitationalConstant > 0)) throw new Error('NBODY_INVALID_G');
    if (!(softening >= 0)) throw new Error('NBODY_INVALID_SOFTENING');
    this.count = count;
    this.gravitationalConstant = gravitationalConstant;
    this.softening = softening;
    this.mass = new Float64Array(count);
    this.position = new Float64Array(count * 3);
    this.velocity = new Float64Array(count * 3);
    this.acceleration = new Float64Array(count * 3);
    this.time = 0;
    this.mass.fill(1);
  }

  setBody(index, { mass = 1, position = [0, 0, 0], velocity = [0, 0, 0] } = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) throw new Error('NBODY_INDEX_RANGE');
    if (!(mass > 0) || !Number.isFinite(mass)) throw new Error('NBODY_INVALID_MASS');
    if (position.length !== 3 || velocity.length !== 3) throw new Error('NBODY_VECTOR_SIZE');
    this.mass[index] = mass;
    const offset = index * 3;
    for (let axis = 0; axis < 3; axis++) {
      this.position[offset + axis] = finite(position[axis], 'POSITION');
      this.velocity[offset + axis] = finite(velocity[axis], 'VELOCITY');
    }
    return this;
  }

  computeAccelerations() {
    this.acceleration.fill(0);
    const epsilon2 = this.softening * this.softening;
    for (let i = 0; i < this.count; i++) {
      const io = i * 3;
      for (let j = i + 1; j < this.count; j++) {
        const jo = j * 3;
        const dx = this.position[jo] - this.position[io];
        const dy = this.position[jo + 1] - this.position[io + 1];
        const dz = this.position[jo + 2] - this.position[io + 2];
        const distance2 = dx * dx + dy * dy + dz * dz + epsilon2;
        const inverseDistance3 = 1 / (distance2 * Math.sqrt(distance2));
        const scaleI = this.gravitationalConstant * this.mass[j] * inverseDistance3;
        const scaleJ = this.gravitationalConstant * this.mass[i] * inverseDistance3;
        this.acceleration[io] += dx * scaleI;
        this.acceleration[io + 1] += dy * scaleI;
        this.acceleration[io + 2] += dz * scaleI;
        this.acceleration[jo] -= dx * scaleJ;
        this.acceleration[jo + 1] -= dy * scaleJ;
        this.acceleration[jo + 2] -= dz * scaleJ;
      }
    }
    return this.acceleration;
  }

  step(dt, iterations = 1) {
    if (!(dt > 0) || !Number.isFinite(dt)) throw new Error('NBODY_INVALID_DT');
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000) throw new Error('NBODY_INVALID_ITERATIONS');
    this.computeAccelerations();
    const halfDt = dt * 0.5;
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let i = 0; i < this.velocity.length; i++) {
        this.velocity[i] += this.acceleration[i] * halfDt;
        this.position[i] += this.velocity[i] * dt;
      }
      this.computeAccelerations();
      for (let i = 0; i < this.velocity.length; i++) this.velocity[i] += this.acceleration[i] * halfDt;
      this.time += dt;
    }
    return this;
  }

  momentum() {
    const result = [0, 0, 0];
    for (let body = 0; body < this.count; body++) {
      const offset = body * 3;
      for (let axis = 0; axis < 3; axis++) result[axis] += this.mass[body] * this.velocity[offset + axis];
    }
    return result;
  }

  centerOfMass() {
    const result = [0, 0, 0];
    let totalMass = 0;
    for (let body = 0; body < this.count; body++) {
      const mass = this.mass[body];
      const offset = body * 3;
      totalMass += mass;
      for (let axis = 0; axis < 3; axis++) result[axis] += mass * this.position[offset + axis];
    }
    return result.map(value => value / totalMass);
  }

  totalEnergy() {
    let kinetic = 0;
    let potential = 0;
    const epsilon2 = this.softening * this.softening;
    for (let i = 0; i < this.count; i++) {
      const io = i * 3;
      const speed2 = this.velocity[io] ** 2 + this.velocity[io + 1] ** 2 + this.velocity[io + 2] ** 2;
      kinetic += 0.5 * this.mass[i] * speed2;
      for (let j = i + 1; j < this.count; j++) {
        const jo = j * 3;
        const dx = this.position[jo] - this.position[io];
        const dy = this.position[jo + 1] - this.position[io + 1];
        const dz = this.position[jo + 2] - this.position[io + 2];
        potential -= this.gravitationalConstant * this.mass[i] * this.mass[j] / Math.sqrt(dx * dx + dy * dy + dz * dz + epsilon2);
      }
    }
    return { kinetic, potential, total: kinetic + potential };
  }

  snapshot() {
    return {
      schema: 'nexus.flux.nbody-state.v1',
      count: this.count,
      gravitationalConstant: this.gravitationalConstant,
      softening: this.softening,
      time: this.time,
      mass: Array.from(this.mass),
      position: Array.from(this.position),
      velocity: Array.from(this.velocity),
    };
  }

  restore(snapshot) {
    if (snapshot?.schema !== 'nexus.flux.nbody-state.v1' || snapshot.count !== this.count) throw new Error('NBODY_SNAPSHOT_INCOMPATIBLE');
    this.gravitationalConstant = finite(snapshot.gravitationalConstant, 'G');
    this.softening = finite(snapshot.softening, 'SOFTENING');
    this.time = finite(snapshot.time, 'TIME');
    this.mass.set(snapshot.mass);
    this.position.set(snapshot.position);
    this.velocity.set(snapshot.velocity);
    this.computeAccelerations();
    return this;
  }

  wasmLayout() {
    return {
      schema: 'nexus.flux.wasm-layout.v1',
      scalar: 'f64',
      count: this.count,
      arrays: {
        mass: { elements: this.mass.length, components: 1 },
        position: { elements: this.position.length, components: 3 },
        velocity: { elements: this.velocity.length, components: 3 },
        acceleration: { elements: this.acceleration.length, components: 3 },
      },
    };
  }
}
