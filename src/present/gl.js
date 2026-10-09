// The presenter: draws a whole CellBuffer with WebGL2 in one full-screen draw
// call. Each fragment finds its cell, fetches the cell's colours and glyph,
// and the glyph's coverage at the same pixel of the atlas: integer fetches
// only, so nothing is filtered or resampled.
import { CELL_STRIDE } from '../contract.js';
import { ATLAS_COLS } from './atlas.js';

const VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uCells;
uniform sampler2D uAtlas;
uniform ivec2 uCell;
uniform int uRows;
uniform int uGlyphs;
out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  p.y = uRows * uCell.y - 1 - p.y;
  ivec2 c = p / uCell;
  ivec2 l = p - c * uCell;
  vec4 bg = texelFetch(uCells, ivec2(c.x * 2, c.y), 0);
  vec3 fg = texelFetch(uCells, ivec2(c.x * 2 + 1, c.y), 0).rgb;
  float cov = 0.0;
  if (uGlyphs == 1) {
    int g = int(bg.a * 255.0 + 0.5);
    ivec2 a = ivec2((g % ${ATLAS_COLS}) * uCell.x + l.x, (g / ${ATLAS_COLS}) * uCell.y + l.y);
    cov = texelFetch(uAtlas, a, 0).r;
  }
  outColor = vec4(mix(bg.rgb, fg, cov), 1.0);
}`;

export class Presenter {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    this.canvas = canvas;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.u = {
      cells: gl.getUniformLocation(prog, 'uCells'),
      atlas: gl.getUniformLocation(prog, 'uAtlas'),
      cell: gl.getUniformLocation(prog, 'uCell'),
      rows: gl.getUniformLocation(prog, 'uRows'),
      glyphs: gl.getUniformLocation(prog, 'uGlyphs'),
    };
    this.vao = gl.createVertexArray();
    this.cellTex = gl.createTexture();
    this.atlasTex = gl.createTexture();
    this.glyphs = true;
  }

  // New grid or cell size: size the canvas in device pixels and allocate.
  resize(cols, rows, atlas, dpr) {
    const { gl, canvas } = this;
    this.cols = cols; this.rows = rows; this.atlas = atlas;
    canvas.width = cols * atlas.cw;
    canvas.height = rows * atlas.ch;
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.cellTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols * 2, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const t of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, t, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, atlas.width, atlas.height, 0, gl.RED, gl.UNSIGNED_BYTE, atlas.cov);
    for (const t of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, t, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Upload the cells of columns c0..c1-1 (a stripe, or the whole grid).
  upload(c0, c1, bytes) {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.cellTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, c0 * 2, 0, (c1 - c0) * 2, this.rows, gl.RGBA, gl.UNSIGNED_BYTE,
      bytes.length === (c1 - c0) * this.rows * CELL_STRIDE ? bytes : bytes.subarray(0, (c1 - c0) * this.rows * CELL_STRIDE));
  }

  draw() {
    const { gl } = this;
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cellTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(this.u.cells, 0);
    gl.uniform1i(this.u.atlas, 1);
    gl.uniform2i(this.u.cell, this.atlas.cw, this.atlas.ch);
    gl.uniform1i(this.u.rows, this.rows);
    gl.uniform1i(this.u.glyphs, this.glyphs ? 1 : 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
