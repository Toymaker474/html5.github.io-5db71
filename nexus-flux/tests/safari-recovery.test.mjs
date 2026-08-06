import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceCanvasForCpu } from '../src/framework.js';
import { TerraEngine } from '../src/engines/terra.js';

test('Safari recovery replaces a WebGPU-claimed canvas before TERRA CPU init', () => {
  const displayContext = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
  };
  const offscreenContext = { putImageData() {} };
  const freshCanvas = {
    width: 0,
    height: 0,
    getContext(kind) { return kind === '2d' ? displayContext : null; },
  };
  let installed = null;
  const claimedCanvas = {
    width: 390,
    height: 844,
    getContext() { return null; },
    cloneNode() { return freshCanvas; },
    replaceWith(next) { installed = next; },
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return { width: 0, height: 0, getContext: () => offscreenContext };
    },
  };
  try {
    const recovered = replaceCanvasForCpu(claimedCanvas);
    assert.equal(recovered, freshCanvas);
    assert.equal(installed, freshCanvas);
    assert.equal(recovered.width, 390);
    assert.equal(recovered.height, 844);
    const terra = new TerraEngine({ size: 96, seed: 91 });
    terra.initCpu(recovered);
    assert.equal(terra.context, displayContext);
    assert.equal(terra.cpuContext, offscreenContext);
    assert.equal(terra.image.data.length, 96 * 96 * 4);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
