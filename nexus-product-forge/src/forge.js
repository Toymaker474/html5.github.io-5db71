// SPDX-License-Identifier: MIT
import { naturalToLumen, parseLumen } from './lumen.js';
import { buildProject } from './templates.js';

const ui = Object.fromEntries(['idea','lumen','forge','compile','projectName','status','summary','download','rerun','files','evidence','preview'].map(id => [id, document.getElementById(id)]));
let currentBuild = null;

const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const bytes = text => new TextEncoder().encode(text);
const unfinishedMarker = /\bTODO\b|\bCOMING SOON\b|<!--\s*PLACEHOLDER\s*-->|>\s*PLACEHOLDER\s*</i;

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', bytes(text));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function setState(name, message) {
  ui.status.className = `badge ${name}`;
  ui.status.textContent = name === 'working' ? 'BUILDING' : name.toUpperCase();
  ui.summary.textContent = message;
}

function validateBuild(build) {
  const required = ['index.html', 'project.lumen', 'nexus-project.json', 'README.md', 'tests/smoke.mjs', 'package.json'];
  const errors = [];
  for (const path of required) if (!build.files[path]?.trim()) errors.push(`Missing required file: ${path}`);
  if (!/^<!doctype html>/i.test(build.files['index.html'] || '')) errors.push('index.html does not start with a document type.');
  if (!build.files['index.html']?.includes('NEXUS Generation One')) errors.push('Generated runtime identity is missing.');
  if (unfinishedMarker.test(Object.values(build.files).join('\n'))) errors.push('Unfinished implementation marker detected.');
  const total = Object.values(build.files).reduce((sum, value) => sum + bytes(value).byteLength, 0);
  if (total > 1_500_000) errors.push('Generation One project exceeds the 1.5 MB safety budget.');
  try {
    const manifest = JSON.parse(build.files['nexus-project.json']);
    if (manifest.project?.schema !== 'nexus.lumen.project.v1') errors.push('Project manifest schema mismatch.');
    if (manifest.dependencies?.length !== 0) errors.push('Generation One generated projects must remain dependency-free.');
  } catch (error) {
    errors.push(`Invalid nexus-project.json: ${error.message}`);
  }
  if (errors.length) {
    const error = new Error(errors.join('\n'));
    error.code = 'FORGE_VALIDATION_FAILED';
    error.details = errors;
    throw error;
  }
  return { fileCount: Object.keys(build.files).length, totalBytes: total, requiredChecks: required.length + 4 };
}

async function evidenceFor(build, validation) {
  const files = [];
  for (const [path, content] of Object.entries(build.files).sort(([a], [b]) => a.localeCompare(b))) {
    files.push({ path, bytes: bytes(content).byteLength, sha256: await sha256(content) });
  }
  const root = await sha256(files.map(file => `${file.path}:${file.sha256}`).join('\n'));
  return {
    schema: 'nexus.forge-evidence.v1',
    generator: 'NEXUS Product Forge Generation One',
    project: build.spec.slug,
    validation,
    files,
    rootSha256: root,
    claims: {
      sourceGenerated: true,
      structuralValidationPassed: true,
      previewPrepared: true,
      physicalIPhoneTested: false,
      independentlyCertified: false,
    },
  };
}

function renderFiles(evidence) {
  ui.files.replaceChildren(...evidence.files.map(file => {
    const row = document.createElement('div');
    row.className = 'file';
    const name = document.createElement('span');
    name.textContent = file.path;
    const size = document.createElement('small');
    size.textContent = `${file.bytes} B`;
    row.append(name, size);
    return row;
  }));
}

async function compileSource(source) {
  setState('working', 'Translating intent into LUMEN and compiling real source files…');
  ui.download.disabled = true;
  ui.rerun.disabled = true;
  await waitFrame();

  const spec = parseLumen(source);
  ui.projectName.textContent = spec.world;
  const build = buildProject(spec, source);

  setState('working', 'Running fail-closed structural validation…');
  await waitFrame();
  const validation = validateBuild(build);

  setState('working', 'Calculating SHA-256 evidence for every generated file…');
  await waitFrame();
  const evidence = await evidenceFor(build, validation);
  build.files['evidence.json'] = `${JSON.stringify(evidence, null, 2)}\n`;
  const finalEvidence = await evidenceFor(build, { ...validation, fileCount: Object.keys(build.files).length });
  currentBuild = { ...build, evidence: finalEvidence };

  renderFiles(finalEvidence);
  ui.evidence.textContent = JSON.stringify(finalEvidence, null, 2);
  ui.preview.srcdoc = build.files['index.html'];
  ui.download.disabled = false;
  ui.rerun.disabled = false;
  setState('pass', `${spec.kind.toUpperCase()} generated: ${finalEvidence.files.length} files, ${validation.totalBytes.toLocaleString()} source bytes, root ${finalEvidence.rootSha256.slice(0, 14)}…`);
}

async function forgeFromIdea() {
  const source = naturalToLumen(ui.idea.value);
  ui.lumen.value = source;
  await compileSource(source);
}

function fail(error) {
  console.error(error);
  currentBuild = null;
  ui.download.disabled = true;
  ui.rerun.disabled = true;
  ui.evidence.textContent = JSON.stringify({ code: error.code || 'FORGE_ERROR', message: error.message, details: error.details || [] }, null, 2);
  setState('fail', error.message);
}

async function downloadCurrent() {
  if (!currentBuild) return;
  const files = { ...currentBuild.files, 'evidence.json': `${JSON.stringify(currentBuild.evidence, null, 2)}\n` };
  let blob;
  let extension;
  if (globalThis.fflate?.zipSync) {
    const archive = Object.fromEntries(Object.entries(files).map(([path, content]) => [path, globalThis.fflate.strToU8(content)]));
    blob = new Blob([globalThis.fflate.zipSync(archive, { level: 6, mtime: new Date('1980-01-01T00:00:00Z') })], { type: 'application/zip' });
    extension = 'zip';
  } else {
    blob = new Blob([JSON.stringify({ schema: 'nexus.project-bundle.v1', files }, null, 2)], { type: 'application/json' });
    extension = 'nexus.json';
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${currentBuild.spec.slug}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}

ui.forge.addEventListener('click', () => forgeFromIdea().catch(fail));
ui.compile.addEventListener('click', () => compileSource(ui.lumen.value).catch(fail));
ui.download.addEventListener('click', () => downloadCurrent().catch(fail));
ui.rerun.addEventListener('click', () => currentBuild && compileSource(currentBuild.files['project.lumen']).catch(fail));
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  ui.idea.value = button.dataset.example;
  forgeFromIdea().catch(fail);
}));

forgeFromIdea().catch(fail);
