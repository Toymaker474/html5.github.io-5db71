const FORBIDDEN = [/\bwhile\s*\(/, /@group\((\d{2,})\)/, /ptr\s*</];
export function lintWgsl(source, { requiredBindings = [], maxBytes = 100_000 } = {}) {
  const text = String(source); const errors = [];
  if (!text.trim()) errors.push('WGSL_EMPTY');
  if (new TextEncoder().encode(text).byteLength > maxBytes) errors.push('WGSL_TOO_LARGE');
  for (const rule of FORBIDDEN) if (rule.test(text)) errors.push(`WGSL_FORBIDDEN:${rule}`);
  const bindings = [...text.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)/g)].map(m => `${m[1]}:${m[2]}`);
  if (new Set(bindings).size !== bindings.length) errors.push('WGSL_DUPLICATE_BINDING');
  for (const required of requiredBindings) if (!bindings.includes(required)) errors.push(`WGSL_MISSING_BINDING:${required}`);
  if (!/@compute|@fragment|@vertex/.test(text)) errors.push('WGSL_NO_ENTRY_STAGE');
  return { ok: errors.length === 0, errors, bindings, bytes: new TextEncoder().encode(text).byteLength };
}
export async function validateShaderModule(device, source, options) {
  const lint = lintWgsl(source, options);
  if (!lint.ok) throw Object.assign(new Error(lint.errors.join(', ')), { code: 'WGSL_LINT_FAILED', lint });
  const module = device.createShaderModule({ code: source });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(message => message.type === 'error');
  if (errors.length) throw Object.assign(new Error(errors.map(error => error.message).join('\n')), { code: 'WGSL_COMPILE_FAILED', errors });
  return { module, lint, messages: info.messages };
}
