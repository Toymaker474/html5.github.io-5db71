// SPDX-License-Identifier: MIT

export const GENERATION_ONE_TOOLS = Object.freeze([
  {
    id: 'lumen-compiler',
    version: '1.0.0',
    kind: 'compiler',
    purpose: 'Translate strict LUMEN/1 into a validated project specification.',
    inputs: ['UTF-8 LUMEN source'],
    outputs: ['nexus.lumen.project.v1'],
    permissions: ['memory:temporary'],
    deterministic: true,
    implemented: true,
  },
  {
    id: 'web-app-builder',
    version: '1.0.0',
    kind: 'builder',
    purpose: 'Generate a persistent standards-based browser application.',
    inputs: ['nexus.lumen.project.v1 kind=app'],
    outputs: ['project file map'],
    permissions: ['generated-app:localStorage'],
    deterministic: true,
    implemented: true,
  },
  {
    id: 'simulation-builder',
    version: '1.0.0',
    kind: 'builder',
    purpose: 'Generate an interactive Canvas 2D particle simulation.',
    inputs: ['nexus.lumen.project.v1 kind=simulation'],
    outputs: ['project file map'],
    permissions: ['generated-app:pointer-events', 'generated-app:animation-frame'],
    deterministic: true,
    implemented: true,
  },
  {
    id: 'game-builder',
    version: '1.0.0',
    kind: 'builder',
    purpose: 'Generate a touch-controlled Canvas 2D game loop.',
    inputs: ['nexus.lumen.project.v1 kind=game'],
    outputs: ['project file map'],
    permissions: ['generated-app:pointer-events', 'generated-app:animation-frame'],
    deterministic: true,
    implemented: true,
  },
  {
    id: 'browser-neuron-builder',
    version: '1.0.0',
    kind: 'builder',
    purpose: 'Generate a locally trainable logistic neural model with weight export.',
    inputs: ['nexus.lumen.project.v1 kind=ai'],
    outputs: ['project file map', 'exportable model weights'],
    permissions: ['generated-app:download'],
    deterministic: false,
    nondeterminism: 'Initial model weights use Math.random inside the generated product.',
    implemented: true,
  },
  {
    id: 'structural-validator',
    version: '1.0.0',
    kind: 'validator',
    purpose: 'Block missing files, invalid manifests, placeholders, and oversized builds.',
    inputs: ['project file map'],
    outputs: ['validation result'],
    permissions: ['memory:temporary'],
    deterministic: true,
    implemented: true,
  },
  {
    id: 'sha256-evidence-writer',
    version: '1.0.0',
    kind: 'evidence',
    purpose: 'Hash every generated file and derive a project root hash.',
    inputs: ['validated project file map'],
    outputs: ['nexus.forge-evidence.v1'],
    permissions: ['web-crypto:digest'],
    deterministic: true,
    implemented: true,
  },
  {
    id: 'zip-packager',
    version: '1.0.0',
    kind: 'packager',
    purpose: 'Package generated files into a reproducible ZIP archive.',
    inputs: ['project file map'],
    outputs: ['ZIP Blob'],
    permissions: ['download:user-initiated'],
    deterministic: true,
    implementation: 'fflate 0.8.3, MIT',
    implemented: true,
  },
]);

export function getImplementedTool(id) {
  const tool = GENERATION_ONE_TOOLS.find(candidate => candidate.id === id);
  if (!tool || tool.implemented !== true) {
    const error = new Error(`Tool '${id}' is not implemented in Generation One.`);
    error.code = 'TOOL_NOT_IMPLEMENTED';
    throw error;
  }
  return tool;
}
