import test from 'node:test';
import assert from 'node:assert/strict';
import {NBodySystem} from '../src/lib/nbody.js';
import {NBodyWasmBridge} from '../src/lib/wasm-memory.js';
import {buildNBodyPairGravityWasmBinary,NBodyPairGravityWasmKernel} from '../src/lib/wasm-gravity.js';

const buildSystem=()=>new NBodySystem({count:3,gravitationalConstant:.75,softening:.02})
  .setBody(0,{mass:2,position:[-1,.25,.5]})
  .setBody(1,{mass:1.5,position:[.75,-.5,.1]})
  .setBody(2,{mass:.4,position:[.2,1.25,-.75]});

test('native WASM pair-gravity arithmetic matches the JavaScript reference exactly',async()=>{
  const system=buildSystem();
  const expected=Array.from(system.computeAccelerations());
  const bridge=new NBodyWasmBridge(system.count).push(system);
  const binary=buildNBodyPairGravityWasmBinary();
  assert.equal(WebAssembly.validate(binary),true);
  const kernel=await NBodyPairGravityWasmKernel.create(bridge.arena);
  kernel.computeAll(system.gravitationalConstant,system.softening);
  assert.deepEqual(Array.from(bridge.arena.view('acceleration')),expected);
  assert.equal(kernel.instance.exports.nbodyPairGravity instanceof Function,true);
  assert.deepEqual(kernel.contract(),{
    schema:'nexus.flux.nbody-wasm-pair-gravity.v1',
    operation:'symmetric softened pair gravity',
    scalar:'f64',
    nativePairArithmetic:true,
    nativePairLoop:false,
    orchestration:'javascript-bounded-pair-loop',
    maximumBodies:128,
    count:3,
    binaryBytes:binary.byteLength,
    importedMemory:true,
    deterministic:true,
  });
});

test('native WASM pair gravity preserves force symmetry and blocks unsafe requests',async()=>{
  const system=new NBodySystem({count:2,gravitationalConstant:1.25,softening:.01})
    .setBody(0,{mass:2,position:[-1,0,0]})
    .setBody(1,{mass:3,position:[1,0,0]});
  const bridge=new NBodyWasmBridge(2).push(system);
  const kernel=await NBodyPairGravityWasmKernel.create(bridge.arena,{maximumBodies:2});
  kernel.computeAll(system.gravitationalConstant,system.softening);
  const acceleration=bridge.arena.view('acceleration');
  assert.ok(Math.abs(system.mass[0]*acceleration[0]+system.mass[1]*acceleration[3])<1e-15);
  assert.equal(acceleration[1],0);assert.equal(acceleration[2],0);assert.equal(acceleration[4],0);assert.equal(acceleration[5],0);
  assert.throws(()=>kernel.applyPair(0,0),/INVALID_PAIR/);
  assert.throws(()=>kernel.applyPair(0,2),/INVALID_PAIR/);
  assert.throws(()=>kernel.applyPair(0,1,0),/INVALID_G/);
  assert.throws(()=>kernel.applyPair(0,1,1,-1),/INVALID_SOFTENING/);
  await assert.rejects(()=>NBodyPairGravityWasmKernel.create(new NBodyWasmBridge(3).arena,{maximumBodies:2}),/PHONE_LIMIT/);
});
