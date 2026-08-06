export class FluxProfiler {
  constructor(limit = 180) { this.limit = limit; this.frames = []; this.sections = new Map(); }
  begin(name) { this.sections.set(name, performance.now()); }
  end(name) {
    const start = this.sections.get(name); if (start == null) return null;
    const duration = performance.now() - start; this.sections.delete(name); return duration;
  }
  frame(ms) { this.frames.push(ms); if (this.frames.length > this.limit) this.frames.shift(); }
  stats() {
    if (!this.frames.length) return { fps: 0, averageMs: 0, p95Ms: 0, worstMs: 0 };
    const sorted = [...this.frames].sort((a, b) => a - b);
    const averageMs = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    return { fps: 1000 / averageMs, averageMs, p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)], worstMs: sorted.at(-1) };
  }
}
