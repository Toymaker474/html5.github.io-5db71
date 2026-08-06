const encodeU32=value=>{if(!Number.isSafeInteger(value)||value<0)throw new Error('WASM_BINARY_INVALID_U32');const bytes=[];do{let byte=value&0x7f;value=Math.floor(value/128);if(value)byte|=0x80;bytes.push(byte);}while(value);return bytes;};
const encodeString=value=>{const bytes=[...new TextEncoder().encode(value)];return[...encodeU32(bytes.length),...bytes];};
const encodeF64=value=>{const bytes=new Uint8Array(8);new DataView(bytes.buffer).setFloat64(0,value,true);return[...bytes];};
const section=(id,payload)=>[id,...encodeU32(payload.length),...payload];
const localGet=index=>[0x20,index];
const localSet=index=>[0x21,index];
const i32Const=value=>[0x41,...encodeU32(value)];
const address=(base,offset,axis=0)=>[...localGet(base),...localGet(offset),0x6a,...(axis?[...i32Const(axis*8),0x6a]:[])];
const loadF64=(base,offset,axis=0)=>[...address(base,offset,axis),0x2b,0x03,0x00];
const storeF64=(base,offset,axis,value)=>[...address(base,offset,axis),...value,0x39,0x03,0x00];

export function buildNBodyPairGravityWasmBinary(){
  const typeSection=section(1,[...encodeU32(1),0x60,...encodeU32(7),0x7f,0x7f,0x7f,0x7f,0x7f,0x7c,0x7c,...encodeU32(0)]);
  const importSection=section(2,[...encodeU32(1),...encodeString('env'),...encodeString('memory'),0x02,0x00,...encodeU32(1)]);
  const functionSection=section(3,[...encodeU32(1),...encodeU32(0)]);
  const exportSection=section(7,[...encodeU32(1),...encodeString('nbodyPairGravity'),0x00,...encodeU32(0)]);
  const instructions=[];
  instructions.push(...localGet(3),...i32Const(24),0x6c,...localSet(7));
  instructions.push(...localGet(4),...i32Const(24),0x6c,...localSet(8));
  instructions.push(...loadF64(1,8,0),...loadF64(1,7,0),0xa1,...localSet(9));
  instructions.push(...loadF64(1,8,1),...loadF64(1,7,1),0xa1,...localSet(10));
  instructions.push(...loadF64(1,8,2),...loadF64(1,7,2),0xa1,...localSet(11));
  instructions.push(...localGet(9),...localGet(9),0xa2,...localGet(10),...localGet(10),0xa2,0xa0,...localGet(11),...localGet(11),0xa2,0xa0,...localGet(6),0xa0,...localSet(12));
  instructions.push(0x44,...encodeF64(1),...localGet(12),...localGet(12),0x9f,0xa2,0xa3,...localSet(13));
  instructions.push(...localGet(5),...localGet(0),...localGet(4),...i32Const(3),0x74,0x6a,0x2b,0x03,0x00,0xa2,...localGet(13),0xa2,...localSet(14));
  instructions.push(...localGet(5),...localGet(0),...localGet(3),...i32Const(3),0x74,0x6a,0x2b,0x03,0x00,0xa2,...localGet(13),0xa2,...localSet(15));
  for(let axis=0;axis<3;axis++){
    const delta=9+axis;
    instructions.push(...storeF64(2,7,axis,[...loadF64(2,7,axis),...localGet(delta),...localGet(14),0xa2,0xa0]));
    instructions.push(...storeF64(2,8,axis,[...loadF64(2,8,axis),...localGet(delta),...localGet(15),0xa2,0xa1]));
  }
  instructions.push(0x0b);
  const body=[...encodeU32(2),...encodeU32(2),0x7f,...encodeU32(7),0x7c,...instructions];
  const codeSection=section(10,[...encodeU32(1),...encodeU32(body.length),...body]);
  return new Uint8Array([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00,...typeSection,...importSection,...functionSection,...exportSection,...codeSection]);
}

export class NBodyPairGravityWasmKernel{
  static async create(arena,{maximumBodies=128}={}){
    if(!arena?.memory||!(arena.memory instanceof WebAssembly.Memory))throw new Error('NBODY_WASM_GRAVITY_INVALID_ARENA');
    if(!Number.isInteger(maximumBodies)||maximumBodies<2||maximumBodies>512)throw new Error('NBODY_WASM_GRAVITY_INVALID_LIMIT');
    const layout=arena.contract().arrays;
    for(const name of ['mass','position','acceleration'])if(!layout[name]||layout[name].scalar!=='f64')throw new Error('NBODY_WASM_GRAVITY_LAYOUT_MISMATCH');
    const count=layout.mass.elements;
    if(layout.position.elements!==count*3||layout.acceleration.elements!==count*3)throw new Error('NBODY_WASM_GRAVITY_LAYOUT_MISMATCH');
    if(count>maximumBodies)throw new Error('NBODY_WASM_GRAVITY_PHONE_LIMIT');
    const binary=buildNBodyPairGravityWasmBinary();
    if(!WebAssembly.validate(binary))throw new Error('NBODY_WASM_GRAVITY_BINARY_INVALID');
    const{instance,module}=await WebAssembly.instantiate(binary,{env:{memory:arena.memory}});
    if(!(instance.exports.nbodyPairGravity instanceof Function))throw new Error('NBODY_WASM_GRAVITY_EXPORT_MISSING');
    return new NBodyPairGravityWasmKernel({arena,instance,module,binaryBytes:binary.byteLength,count,maximumBodies});
  }

  constructor({arena,instance,module,binaryBytes,count,maximumBodies}){this.arena=arena;this.instance=instance;this.module=module;this.binaryBytes=binaryBytes;this.count=count;this.maximumBodies=maximumBodies;}

  applyPair(i,j,gravitationalConstant=1,softening=1e-3){
    if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||j<0||i>=this.count||j>=this.count||i===j)throw new Error('NBODY_WASM_GRAVITY_INVALID_PAIR');
    if(!(gravitationalConstant>0)||!Number.isFinite(gravitationalConstant))throw new Error('NBODY_WASM_GRAVITY_INVALID_G');
    if(!(softening>=0)||!Number.isFinite(softening))throw new Error('NBODY_WASM_GRAVITY_INVALID_SOFTENING');
    const arrays=this.arena.contract().arrays;
    this.instance.exports.nbodyPairGravity(arrays.mass.byteOffset,arrays.position.byteOffset,arrays.acceleration.byteOffset,i,j,gravitationalConstant,softening*softening);
    return this.arena.view('acceleration');
  }

  computeAll(gravitationalConstant=1,softening=1e-3){
    this.arena.view('acceleration').fill(0);
    for(let i=0;i<this.count;i++)for(let j=i+1;j<this.count;j++)this.applyPair(i,j,gravitationalConstant,softening);
    return this.arena.view('acceleration');
  }

  contract(){return{schema:'nexus.flux.nbody-wasm-pair-gravity.v1',operation:'symmetric softened pair gravity',scalar:'f64',nativePairArithmetic:true,nativePairLoop:false,orchestration:'javascript-bounded-pair-loop',maximumBodies:this.maximumBodies,count:this.count,binaryBytes:this.binaryBytes,importedMemory:true,deterministic:true};}
}
