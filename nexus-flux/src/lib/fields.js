import { clamp, lerp } from './math.js';
export class ScalarField2D {
  constructor(width, height, data = new Float32Array(width * height)) { if (data.length !== width * height) throw new Error('FIELD_SIZE_MISMATCH'); this.width = width; this.height = height; this.data = data; }
  index(x, y) { return (clamp(y | 0, 0, this.height - 1) * this.width) + clamp(x | 0, 0, this.width - 1); }
  get(x, y) { return this.data[this.index(x, y)]; }
  set(x, y, value) { this.data[this.index(x, y)] = value; return this; }
  sample(u, v) {
    const x = clamp(u, 0, 1) * (this.width - 1), y = clamp(v, 0, 1) * (this.height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(this.width - 1, x0 + 1), y1 = Math.min(this.height - 1, y0 + 1);
    return lerp(lerp(this.get(x0, y0), this.get(x1, y0), x - x0), lerp(this.get(x0, y1), this.get(x1, y1), x - x0), y - y0);
  }
  gradient(x, y) { return [(this.get(x + 1, y) - this.get(x - 1, y)) * 0.5, (this.get(x, y + 1) - this.get(x, y - 1)) * 0.5]; }
  laplacian(x, y) { return this.get(x - 1, y) + this.get(x + 1, y) + this.get(x, y - 1) + this.get(x, y + 1) - 4 * this.get(x, y); }
  clone() { return new ScalarField2D(this.width, this.height, this.data.slice()); }
  fill(fn) { for (let y = 0; y < this.height; y += 1) for (let x = 0; x < this.width; x += 1) this.set(x, y, fn(x, y, x / (this.width - 1), y / (this.height - 1))); return this; }
  stats() { let min = Infinity, max = -Infinity, sum = 0; for (const value of this.data) { min = Math.min(min, value); max = Math.max(max, value); sum += value; } return { min, max, mean: sum / this.data.length }; }
}
export class PingPongField { constructor(field) { this.a = field; this.b = new ScalarField2D(field.width, field.height); this.front = this.a; this.back = this.b; } swap() { [this.front, this.back] = [this.back, this.front]; return this.front; } }
