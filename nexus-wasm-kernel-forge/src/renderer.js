// SPDX-License-Identifier: MIT

const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D field;
uniform vec2 texel;
uniform float time;

vec3 sampleField(vec2 p) { return texture(field, clamp(p, 0.0, 1.0)).rgb; }

void main() {
  vec2 p = vec2(uv.x, 1.0 - uv.y);
  vec3 center = sampleField(p);
  vec3 nearGlow = vec3(0.0);
  nearGlow += sampleField(p + texel * vec2( 1.0, 0.0));
  nearGlow += sampleField(p + texel * vec2(-1.0, 0.0));
  nearGlow += sampleField(p + texel * vec2(0.0,  1.0));
  nearGlow += sampleField(p + texel * vec2(0.0, -1.0));
  nearGlow += sampleField(p + texel * vec2( 2.0, 2.0)) * 0.35;
  nearGlow += sampleField(p + texel * vec2(-2.0, 2.0)) * 0.35;
  nearGlow += sampleField(p + texel * vec2( 2.0,-2.0)) * 0.35;
  nearGlow += sampleField(p + texel * vec2(-2.0,-2.0)) * 0.35;
  nearGlow *= 0.17;

  vec3 hdr = center * 1.35 + nearGlow * 0.85;
  vec3 mapped = vec3(1.0) - exp(-hdr * 2.7);
  mapped = pow(max(mapped, 0.0), vec3(0.72));
  float edge = smoothstep(0.85, 0.15, length(p - 0.5));
  float grain = fract(sin(dot(gl_FragCoord.xy + time, vec2(12.9898, 78.233))) * 43758.5453);
  mapped *= 0.72 + edge * 0.4;
  mapped += (grain - 0.5) * 0.012;
  color = vec4(mapped, 1.0);
}`;

function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result);
    gl.deleteShader(result);
    throw new Error(`WebGL shader failed: ${message}`);
  }
  return result;
}

function program(gl) {
  const result = gl.createProgram();
  gl.attachShader(result, shader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(result, shader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(`WebGL program failed: ${gl.getProgramInfoLog(result)}`);
  return result;
}

const PALETTE_MATRICES = Object.freeze({
  abyss: [[0.35, 0.03, 0.9], [0.05, 0.72, 0.92], [0.82, 0.12, 0.88]],
  plasma: [[1.0, 0.08, 0.25], [0.2, 0.35, 1.0], [1.0, 0.65, 0.05]],
  aurora: [[0.05, 1.0, 0.58], [0.05, 0.45, 1.0], [0.72, 0.12, 1.0]],
  mineral: [[0.1, 0.72, 0.8], [0.95, 0.42, 0.06], [0.68, 0.9, 0.95]],
});

export class FluidRenderer {
  constructor(canvas, width, height, palette = 'abyss') {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.palette = palette;
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });
    if (!this.gl) throw Object.assign(new Error('WebGL2 is required for the Generation One fluid renderer.'), { code: 'WEBGL2_UNAVAILABLE' });
    this.program = program(this.gl);
    this.pixels = new Uint8Array(width * height * 4);
    this.texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.pixels);
    this.gl.useProgram(this.program);
    this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'field'), 0);
    this.gl.uniform2f(this.gl.getUniformLocation(this.program, 'texel'), 1 / width, 1 / height);
    this.resize();
  }

  setPalette(name) {
    if (PALETTE_MATRICES[name]) this.palette = name;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    const displayWidth = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const displayHeight = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(red, green, blue, now = performance.now()) {
    const matrix = PALETTE_MATRICES[this.palette] ?? PALETTE_MATRICES.abyss;
    for (let index = 0, pixel = 0; index < red.length; index += 1, pixel += 4) {
      const r = Math.max(0, red[index]);
      const g = Math.max(0, green[index]);
      const b = Math.max(0, blue[index]);
      const outR = r * matrix[0][0] + g * matrix[1][0] + b * matrix[2][0];
      const outG = r * matrix[0][1] + g * matrix[1][1] + b * matrix[2][1];
      const outB = r * matrix[0][2] + g * matrix[1][2] + b * matrix[2][2];
      this.pixels[pixel] = Math.min(255, Math.round(outR * 118));
      this.pixels[pixel + 1] = Math.min(255, Math.round(outG * 118));
      this.pixels[pixel + 2] = Math.min(255, Math.round(outB * 118));
      this.pixels[pixel + 3] = 255;
    }

    const gl = this.gl;
    this.resize();
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.uniform1f(gl.getUniformLocation(this.program, 'time'), now * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
