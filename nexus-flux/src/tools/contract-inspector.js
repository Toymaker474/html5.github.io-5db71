export function inspectContract(contract, { allowedCapabilities = [] } = {}) {
  const errors = [];
  if (!contract || typeof contract !== 'object') errors.push('CONTRACT_NOT_OBJECT');
  if (!/^nexus\.flux\./.test(contract?.schema ?? '')) errors.push('CONTRACT_SCHEMA_INVALID');
  if (!Array.isArray(contract?.capabilities)) errors.push('CONTRACT_CAPABILITIES_INVALID');
  for (const capability of contract?.capabilities ?? []) if (!allowedCapabilities.includes(capability)) errors.push(`CONTRACT_CAPABILITY_BLOCKED:${capability}`);
  if (!Array.isArray(contract?.inputs) || !Array.isArray(contract?.outputs)) errors.push('CONTRACT_IO_INVALID');
  return { ok: errors.length === 0, errors, normalized: errors.length ? null : structuredClone(contract) };
}
export function makeContract({ name, version = '0.1.0', capabilities = [], inputs = [], outputs = [], parameters = {} }) {
  return { schema: 'nexus.flux.tool-contract.v1', name, version, capabilities, inputs, outputs, parameters };
}
