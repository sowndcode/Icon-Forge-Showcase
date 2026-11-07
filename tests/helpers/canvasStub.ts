// Deterministic stand-in for OffscreenCanvas in node tests: text is measured as 0.6 × font size per
// character, drawing calls do nothing. Lets the real template builders and stores run without a browser,
// and makes their output repeatable (snapshots of protected templates rely on that).

class Ctx {
  font = '16px sans-serif';
  letterSpacing = '0px';
  canvas: unknown;
  constructor(c: unknown) {
    this.canvas = c;
  }
  measureText(t: string) {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const size = m ? parseFloat(m[1]) : 16;
    const w = t.length * size * 0.6;
    return { width: w, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2, fontBoundingBoxAscent: size * 0.9, fontBoundingBoxDescent: size * 0.25 };
  }
  getImageData(_x: number, _y: number, w: number, h: number) {
    return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h };
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
  createPattern() {
    return null;
  }
}
const noop = () => undefined;
for (const k of ['save', 'restore', 'fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fill', 'stroke', 'clip', 'translate', 'rotate', 'scale', 'setTransform', 'resetTransform', 'transform', 'drawImage', 'fillText', 'strokeText', 'putImageData', 'quadraticCurveTo', 'bezierCurveTo', 'roundRect', 'arcTo', 'setLineDash'])
  (Ctx.prototype as unknown as Record<string, unknown>)[k] = noop;

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return new Ctx(this);
  }
  convertToBlob() {
    return Promise.resolve(new Blob([]));
  }
}

const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.OffscreenCanvas === 'undefined') g.OffscreenCanvas = FakeOffscreenCanvas;
if (typeof g.requestAnimationFrame === 'undefined') g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
