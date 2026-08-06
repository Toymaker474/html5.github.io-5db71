export class AdaptiveQuality {
  constructor({ targetMs = 16.7, minScale = 0.5, maxScale = 1, initialScale = 0.85, window = 45 } = {}) {
    this.targetMs = targetMs; this.minScale = minScale; this.maxScale = maxScale;
    this.scale = initialScale; this.window = window; this.samples = [];
  }
  push(frameMs) {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return this.scale;
    this.samples.push(frameMs); if (this.samples.length > this.window) this.samples.shift();
    if (this.samples.length < Math.min(12, this.window)) return this.scale;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p80 = sorted[Math.floor((sorted.length - 1) * 0.8)];
    if (p80 > this.targetMs * 1.18) this.scale = Math.max(this.minScale, this.scale * 0.9);
    else if (p80 < this.targetMs * 0.72) this.scale = Math.min(this.maxScale, this.scale * 1.04);
    return this.scale;
  }
  resolution(width, height, dpr = 1) {
    const ratio = Math.min(dpr, 2) * this.scale;
    return { width: Math.max(2, Math.floor(width * ratio / 2) * 2), height: Math.max(2, Math.floor(height * ratio / 2) * 2), scale: this.scale };
  }
}
