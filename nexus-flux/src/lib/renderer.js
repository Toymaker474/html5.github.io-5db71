export function resizeCanvas(canvas, scale = 1) {
  const dpr = Math.min(devicePixelRatio || 1, 2) * scale;
  const width = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  return { width, height, dpr };
}
export function createCpuSurface(canvas) {
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!context) throw new Error('CANVAS_2D_UNAVAILABLE');
  return { context, clear(color = '#02050b') { context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height); } };
}
export const additiveBlend = {
  color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one' },
  alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
};
