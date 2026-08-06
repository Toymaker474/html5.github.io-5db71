export async function profileCapabilities(nav = globalThis.navigator) {
  const report = {
    schema: 'nexus.flux.capabilities.v1',
    webgpu: false,
    backend: 'cpu',
    adapter: null,
    limits: {},
    features: [],
    hardwareConcurrency: nav?.hardwareConcurrency ?? 1,
    deviceMemory: nav?.deviceMemory ?? null,
  };
  if (!nav?.gpu) return report;
  const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return report;
  report.webgpu = true;
  report.backend = 'webgpu';
  report.features = [...adapter.features].sort();
  report.limits = Object.fromEntries(Object.entries(adapter.limits));
  report.adapter = adapter.info ? { ...adapter.info } : { description: 'WebGPU adapter' };
  return report;
}

export function chooseGrid(report, viewport = { width: 390, height: 844, dpr: 3 }) {
  const pixels = viewport.width * viewport.height * Math.min(viewport.dpr ?? 1, 2);
  if (!report.webgpu) return pixels > 900000 ? 96 : 128;
  if ((report.deviceMemory ?? 8) <= 4) return 128;
  if (pixels > 1_500_000) return 192;
  return 256;
}
