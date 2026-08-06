export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const length2 = (x, y) => Math.hypot(x, y);
export const normalize2 = (x, y) => { const length = Math.hypot(x, y) || 1; return [x / length, y / length]; };
export const hash2 = (x, y, seed = 0) => {
  let h = Math.imul((x | 0) ^ seed, 0x45d9f3b) ^ Math.imul((y | 0) + seed, 0x119de1f3);
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; return (h >>> 0) / 0xffffffff;
};
export function valueNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = smoothstep(0, 1, x - x0), ty = smoothstep(0, 1, y - y0);
  return lerp(lerp(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), tx), lerp(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), tx), ty);
}
export function fractalNoise2(x, y, { seed = 0, octaves = 5, lacunarity = 2, gain = 0.5 } = {}) {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0;
  for (let octave = 0; octave < octaves; octave += 1) { value += valueNoise2(x * frequency, y * frequency, seed + octave * 1013) * amplitude; total += amplitude; amplitude *= gain; frequency *= lacunarity; }
  return value / total;
}
export function taylorGreenVelocity(x, y, time = 0, strength = 1) {
  const phase = time * 0.18;
  return [Math.sin(Math.PI * 2 * (x + phase)) * Math.cos(Math.PI * 2 * y) * strength, -Math.cos(Math.PI * 2 * x) * Math.sin(Math.PI * 2 * (y + phase)) * strength];
}
