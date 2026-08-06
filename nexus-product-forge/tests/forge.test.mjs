import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIdea, naturalToLumen, parseLumen } from '../src/lumen.js';
import { buildProject } from '../src/templates.js';

const ideas = {
  app: 'Build a local project board app that stores tasks offline.',
  simulation: 'Make a creature evolution simulation with particles and gravity.',
  game: 'Make a mobile survival game with enemies and score.',
  ai: 'Make a browser neural classifier I can train and export.',
};

test('natural intent is classified into all four Generation One builders', () => {
  for (const [kind, idea] of Object.entries(ideas)) assert.equal(classifyIdea(idea), kind);
});

test('natural intent compiles into valid LUMEN/1', () => {
  const source = naturalToLumen(ideas.simulation);
  const spec = parseLumen(source);
  assert.equal(spec.schema, 'nexus.lumen.project.v1');
  assert.equal(spec.kind, 'simulation');
  assert.ok(spec.features.includes('evolution'));
  assert.ok(spec.features.includes('particles'));
});

test('unknown LUMEN keys fail closed', () => {
  assert.throws(() => parseLumen('world "Bad"\nkind app\ngoal "x"\ntarget universal-web\nquality balanced\nmagic silently-ignore-me'), error => {
    assert.equal(error.code, 'LUMEN_INVALID');
    assert.match(error.message, /unknown key/);
    return true;
  });
});

test('every builder emits a complete dependency-free project', () => {
  for (const [kind, idea] of Object.entries(ideas)) {
    const source = naturalToLumen(idea, { kind });
    const spec = parseLumen(source);
    const build = buildProject(spec, source);
    for (const required of ['index.html', 'project.lumen', 'nexus-project.json', 'README.md', 'tests/smoke.mjs', 'package.json']) {
      assert.ok(build.files[required]?.length > 0, `${kind} missing ${required}`);
    }
    const manifest = JSON.parse(build.files['nexus-project.json']);
    assert.deepEqual(manifest.dependencies, []);
    assert.doesNotMatch(Object.values(build.files).join('\n'), /\b(TODO|PLACEHOLDER|COMING SOON)\b/i);
    assert.match(build.files['index.html'], /NEXUS Generation One/);
  }
});

test('generated inline runtimes have valid JavaScript syntax', () => {
  for (const [kind, idea] of Object.entries(ideas)) {
    const source = naturalToLumen(idea, { kind });
    const html = buildProject(parseLumen(source), source).files['index.html'];
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
    assert.equal(scripts.length, 1, `${kind} should have one inline runtime`);
    assert.doesNotThrow(() => new Function(scripts[0]), `${kind} runtime syntax failed`);
  }
});
