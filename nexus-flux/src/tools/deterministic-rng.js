export class DeterministicRng {
  constructor(seed = 0x4e455855) { this.state = seed >>> 0 || 1; }
  nextU32() { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return this.state = x >>> 0; }
  next() { return this.nextU32() / 0x1_0000_0000; }
  range(min, max) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(values) { if (!values.length) throw new Error('RNG_PICK_EMPTY'); return values[this.int(0, values.length - 1)]; }
  clone() { const copy = new DeterministicRng(); copy.state = this.state; return copy; }
}
