import { ATAN_TABLE, SIN_TABLE } from './math_lut.js';

export const EPSILON = 1e-7;

const f32View = new Float32Array(1);
const u32View = new Uint32Array(f32View.buffer);

function f32(value) {
  return Math.fround(value);
}

function f32Bits(value) {
  f32View[0] = value;
  return u32View[0];
}

function roundToNearestEven(value) {
  const base = Math.floor(value);
  const frac = value - base;
  if (frac > 0.5) {
    return base + 1;
  }
  if (frac < 0.5) {
    return base;
  }
  return (base & 1) === 0 ? base : base + 1;
}

export function toS16(value) {
  const v = Math.trunc(value);
  const wrapped = ((v + 0x8000) & 0xffff) - 0x8000;
  return wrapped;
}

export function sinS16(angle) {
  const a = angle & 0xffff;
  let index = a & 0x3fff;
  if (a & 0x4000) {
    index = 0x4000 - index;
  }
  const result = SIN_TABLE[index];
  return (a & 0x8000) ? -result : result;
}

export function cosS16(angle) {
  return sinS16((angle + 0x4000) & 0xffff);
}

function atanIndex(x) {
  const bits = f32Bits(x);
  let r5 = bits & 0x7fffff;
  r5 |= 0x00800000;
  const exp = (bits >>> 23) & 0xff;
  if (exp <= 0x67) {
    return 0;
  }
  let r4 = (0x87 - exp) & 0xffffffff;
  if ((r4 & ~0x1f) === 0) {
    r4 |= 0x20;
  }
  const shift = r4 & 31;
  const shifted = r5 >>> shift;
  const offset = shifted & 0x7ff8;
  return offset >>> 3;
}

function atanS16(value) {
  if (value === 0) {
    return 0;
  }
  let sign = 1;
  let x = value;
  if (x < 0) {
    sign = -1;
    x = -x;
  }
  if (x === 1) {
    return sign * 0x2000;
  }
  let invert = false;
  if (x > 1) {
    x = 1 / x;
    invert = true;
  }
  x = f32(x);
  const index = atanIndex(x);
  const slope = ATAN_TABLE[index * 2];
  const intercept = ATAN_TABLE[index * 2 + 1];
  const angle = f32(f32(x * slope) + intercept);
  let result = roundToNearestEven(angle);
  if (invert) {
    result = 0x4000 - result;
  }
  return result * sign;
}

function atanS16WithDetail(value) {
  if (value === 0) {
    return { angle: 0, index: 0, raw: 0 };
  }
  let sign = 1;
  let x = value;
  if (x < 0) {
    sign = -1;
    x = -x;
  }
  if (x === 1) {
    return { angle: sign * 0x2000, index: 0, raw: 0x2000 };
  }
  let invert = false;
  if (x > 1) {
    x = 1 / x;
    invert = true;
  }
  x = f32(x);
  const index = atanIndex(x);
  const slope = ATAN_TABLE[index * 2];
  const intercept = ATAN_TABLE[index * 2 + 1];
  const angle = f32(f32(x * slope) + intercept);
  let result = roundToNearestEven(angle);
  if (invert) {
    result = 0x4000 - result;
  }
  return { angle: result * sign, index, raw: angle };
}

export function atan2S16(y, x) {
  const yy = f32(y);
  const xx = f32(x);
  if (yy === 0 && xx === 0) {
    return 0;
  }
  const ay = Math.abs(yy);
  const ax = Math.abs(xx);
  let angle;
  let ratio = 0;
  let atanIndexUsed = -1;
  let atanRaw = 0;
  if (ay === ax) {
    angle = ay === 0 ? 0 : 0x2000;
  } else if (ay > ax) {
    ratio = ax / ay;
    const atanDetail = atanS16WithDetail(ratio);
    atanIndexUsed = atanDetail.index;
    atanRaw = atanDetail.raw;
    angle = atanDetail.angle;
    angle = 0x4000 - angle;
  } else {
    ratio = ay / ax;
    const atanDetail = atanS16WithDetail(ratio);
    atanIndexUsed = atanDetail.index;
    atanRaw = atanDetail.raw;
    angle = atanDetail.angle;
  }
  if (xx < 0) {
    if (yy >= 0) {
      angle = 0x8000 - angle;
    } else {
      angle = angle - 0x8000;
    }
  } else if (yy < 0) {
    angle = -angle;
  }
  const result = toS16(angle);
  const debug = (globalThis as any).__DETERMINISM_DEBUG__;
  if (debug?.atan2 && debug.remaining > 0) {
    const sum = Math.abs(yy) + Math.abs(xx);
    if (sum <= (debug.eps ?? 0)) {
      debug.remaining -= 1;
      if (debug.records) {
        const stack = debug.stack ? new Error().stack : null;
        debug.records.push({
          tick: debug.tick ?? null,
          source: debug.source ?? null,
          x: xx,
          y: yy,
          angle: result,
          sum,
          ratio,
          atanIndexUsed,
          atanRaw,
          stack,
        });
      }
    }
  }
  return result;
}

export function atan2S16Safe(y, x, eps = EPSILON) {
  if (Math.abs(y) + Math.abs(x) <= eps) {
    return 0;
  }
  return atan2S16(y, x);
}

export function atan2S16Detail(y, x) {
  const yy = f32(y);
  const xx = f32(x);
  if (yy === 0 && xx === 0) {
    return {
      angle: 0,
      ratio: 0,
      atanIndexUsed: 0,
      atanRaw: 0,
    };
  }
  const ay = Math.abs(yy);
  const ax = Math.abs(xx);
  let angle;
  let ratio = 0;
  let atanIndexUsed = -1;
  let atanRaw = 0;
  if (ay === ax) {
    angle = ay === 0 ? 0 : 0x2000;
  } else if (ay > ax) {
    ratio = ax / ay;
    const atanDetail = atanS16WithDetail(ratio);
    atanIndexUsed = atanDetail.index;
    atanRaw = atanDetail.raw;
    angle = 0x4000 - atanDetail.angle;
  } else {
    ratio = ay / ax;
    const atanDetail = atanS16WithDetail(ratio);
    atanIndexUsed = atanDetail.index;
    atanRaw = atanDetail.raw;
    angle = atanDetail.angle;
  }

  if (xx < 0) {
    if (yy >= 0) {
      angle = 0x8000 - angle;
    } else {
      angle = angle - 0x8000;
    }
  } else if (yy < 0) {
    angle = -angle;
  }
  return {
    angle: toS16(angle),
    ratio,
    atanIndexUsed,
    atanRaw,
  };
}

export function sumSq2(x, y) {
  return x * x + y * y;
}

export function sumSq3(x, y, z) {
  return x * x + y * y + z * z;
}

export function sqrt(value) {
  const v = f32(value);
  if (Number.isNaN(v)) {
    return NaN;
  }
  if (v <= 0) {
    return 0;
  }
  if (!Number.isFinite(v)) {
    return v;
  }
  const inv = rsqrtSmb1(v);
  return f32(v * inv);
}

export function rsqrt(value) {
  const v = f32(value);
  if (Number.isNaN(v)) {
    return NaN;
  }
  if (v <= 0) {
    return Infinity;
  }
  if (!Number.isFinite(v)) {
    return 0;
  }
  return rsqrtSmb1(v);
}

function rsqrtSmb1(value) {
  const v = f32(value);
  // Deterministic approximation using fixed Newton iterations, mirroring SMB1 flow.
  let x = f32(1 / Math.sqrt(v));
  const half = f32(0.5);
  const onePointFive = f32(1.5);
  for (let i = 0; i < 3; i += 1) {
    const xx = f32(x * x);
    const term = f32(onePointFive - f32(half * f32(v * xx)));
    x = f32(x * term);
  }
  return x;
}

export function floor(value) {
  return Math.floor(value);
}

export function vecDot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vecDotNormalized(a, b) {
  const aLenSq = sumSq3(a.x, a.y, a.z);
  const bLenSq = sumSq3(b.x, b.y, b.z);
  if (aLenSq <= EPSILON || bLenSq <= EPSILON) {
    return 0;
  }
  return (a.x * b.x + a.y * b.y + a.z * b.z) * rsqrt(aLenSq * bLenSq);
}

export function vecLen(a) {
  return sqrt(sumSq3(a.x, a.y, a.z));
}

export function vecNormalizeLen(a) {
  const lenSq = sumSq3(a.x, a.y, a.z);
  if (lenSq <= EPSILON) {
    return 0;
  }
  const inv = rsqrt(lenSq);
  a.x *= inv;
  a.y *= inv;
  a.z *= inv;
  return 1 / inv;
}

export function vecSetLen(out, vec, length) {
  const lenSq = sumSq3(vec.x, vec.y, vec.z);
  if (lenSq <= EPSILON) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return 0;
  }
  const inv = rsqrt(lenSq);
  out.x = vec.x * inv * length;
  out.y = vec.y * inv * length;
  out.z = vec.z * inv * length;
  return length;
}

export function vecCross(a, b, out) {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
}

export function vecDistance(a, b) {
  return sqrt(sumSq3(a.x - b.x, a.y - b.y, a.z - b.z));
}

export function quatFromAxisAngle(axis, angleS16, out) {
  const half = angleS16 >> 1;
  const lenSq = sumSq3(axis.x, axis.y, axis.z);
  if (lenSq < EPSILON) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.w = 1;
    return;
  }
  const inv = rsqrt(lenSq) * sinS16(half);
  out.x = axis.x * inv;
  out.y = axis.y * inv;
  out.z = axis.z * inv;
  out.w = cosS16(half);
}

export function quatNormalize(q) {
  const lenSq = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
  if (lenSq <= EPSILON) {
    q.x = 0;
    q.y = 0;
    q.z = 0;
    q.w = 1;
    return;
  }
  const inv = rsqrt(lenSq);
  q.x *= inv;
  q.y *= inv;
  q.z *= inv;
  q.w *= inv;
}

export function quatMul(out, a, b) {
  const ax = a.x;
  const ay = a.y;
  const az = a.z;
  const aw = a.w;
  const bx = b.x;
  const by = b.y;
  const bz = b.z;
  const bw = b.w;
  out.x = aw * bx + ax * bw + ay * bz - az * by;
  out.y = aw * by - ax * bz + ay * bw + az * bx;
  out.z = aw * bz + ax * by - ay * bx + az * bw;
  out.w = aw * bw - ax * bx - ay * by - az * bz;
}

export function quatFromDirs(out, from, to) {
  const fromLenSq = sumSq3(from.x, from.y, from.z);
  const toLenSq = sumSq3(to.x, to.y, to.z);
  if (fromLenSq <= EPSILON || toLenSq <= EPSILON) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.w = 1;
    return;
  }
  const invFrom = rsqrt(fromLenSq);
  const invTo = rsqrt(toLenSq);
  const fx = from.x * invFrom;
  const fy = from.y * invFrom;
  const fz = from.z * invFrom;
  const tx = to.x * invTo;
  const ty = to.y * invTo;
  const tz = to.z * invTo;
  const dot = fx * tx + fy * ty + fz * tz;
  if (dot < -0.999999) {
    let ax = 0;
    let ay = 1;
    let az = 0;
    if (Math.abs(fx) < 0.1 && Math.abs(fz) < 0.1) {
      ax = 1;
      ay = 0;
      az = 0;
    }
    const cx = fy * az - fz * ay;
    const cy = fz * ax - fx * az;
    const cz = fx * ay - fy * ax;
    const axisLenSq = sumSq3(cx, cy, cz);
    if (axisLenSq <= EPSILON) {
      out.x = 0;
      out.y = 0;
      out.z = 0;
      out.w = 1;
      return;
    }
    const invAxis = rsqrt(axisLenSq);
    out.x = cx * invAxis;
    out.y = cy * invAxis;
    out.z = cz * invAxis;
    out.w = 0;
    return;
  }
  const cx = fy * tz - fz * ty;
  const cy = fz * tx - fx * tz;
  const cz = fx * ty - fy * tx;
  out.x = cx;
  out.y = cy;
  out.z = cz;
  out.w = 1 + dot;
  quatNormalize(out);
}

export class MatrixStack {
  constructor() {
    this.mtxA = new Float32Array(12);
    this.mtxB = new Float32Array(12);
    this.stack = [];
    this.stackTop = 0;
    this.tmpForward = { x: 0, y: 0, z: 0 };
    this.tmpUp = { x: 0, y: 0, z: 0 };
    this.fromIdentity();
  }

  fromIdentity() {
    const m = this.mtxA;
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
  }

  fromMtx(src) {
    this.mtxA.set(src);
  }

  toMtx(dest) {
    dest.set(this.mtxA);
  }

  fromTranslate(vec) {
    this.fromTranslateXYZ(vec.x, vec.y, vec.z);
  }

  fromTranslateXYZ(x, y, z) {
    const m = this.mtxA;
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = x;
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = y;
    m[8] = 0; m[9] = 0; m[10] = 1; m[11] = z;
  }

  fromRotateX(angle) {
    const s = sinS16(angle);
    const c = cosS16(angle);
    const m = this.mtxA;
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = c; m[6] = -s; m[7] = 0;
    m[8] = 0; m[9] = s; m[10] = c; m[11] = 0;
  }

  fromRotateY(angle) {
    const s = sinS16(angle);
    const c = cosS16(angle);
    const m = this.mtxA;
    m[0] = c; m[1] = 0; m[2] = s; m[3] = 0;
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
    m[8] = -s; m[9] = 0; m[10] = c; m[11] = 0;
  }

  fromRotateZ(angle) {
    const s = sinS16(angle);
    const c = cosS16(angle);
    const m = this.mtxA;
    m[0] = c; m[1] = -s; m[2] = 0; m[3] = 0;
    m[4] = s; m[5] = c; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
  }

  rotateX(angle) {
    const s = sinS16(angle);
    const c = cosS16(angle);
    const m = this.mtxA;
    const a0 = m[1];
    const a1 = m[2];
    const b0 = m[5];
    const b1 = m[6];
    const c0 = m[9];
    const c1 = m[10];
    m[1] = a0 * c + a1 * s;
    m[2] = a0 * -s + a1 * c;
    m[5] = b0 * c + b1 * s;
    m[6] = b0 * -s + b1 * c;
    m[9] = c0 * c + c1 * s;
    m[10] = c0 * -s + c1 * c;
  }

  rotateY(angle) {
    const s = sinS16(angle);
    const c = cosS16(angle);
    const m = this.mtxA;
    const a0 = m[0];
    const a1 = m[2];
    const b0 = m[4];
    const b1 = m[6];
    const c0 = m[8];
    const c1 = m[10];
    m[0] = a0 * c + a1 * -s;
    m[2] = a0 * s + a1 * c;
    m[4] = b0 * c + b1 * -s;
    m[6] = b0 * s + b1 * c;
    m[8] = c0 * c + c1 * -s;
    m[10] = c0 * s + c1 * c;
  }

  rotateZ(angle) {
    const s = sinS16(angle);
    const c = cosS16(angle);
    const m = this.mtxA;
    const a0 = m[0];
    const a1 = m[1];
    const b0 = m[4];
    const b1 = m[5];
    const c0 = m[8];
    const c1 = m[9];
    m[0] = a0 * c + a1 * s;
    m[1] = a0 * -s + a1 * c;
    m[4] = b0 * c + b1 * s;
    m[5] = b0 * -s + b1 * c;
    m[8] = c0 * c + c1 * s;
    m[9] = c0 * -s + c1 * c;
  }

  translateXYZ(x, y, z) {
    const m = this.mtxA;
    const tx = m[2] * z + m[0] * x + m[3] + m[1] * y;
    const ty = m[6] * z + m[4] * x + m[7] + m[5] * y;
    const tz = m[10] * z + m[8] * x + m[11] + m[9] * y;
    m[3] = tx;
    m[7] = ty;
    m[11] = tz;
  }

  translate(vec) {
    this.translateXYZ(vec.x, vec.y, vec.z);
  }

  translateNeg(vec) {
    this.translateXYZ(-vec.x, -vec.y, -vec.z);
  }

  scaleXYZ(x, y, z) {
    const m = this.mtxA;
    m[0] *= x; m[1] *= y; m[2] *= z;
    m[4] *= x; m[5] *= y; m[6] *= z;
    m[8] *= x; m[9] *= y; m[10] *= z;
  }

  scaleS(s) {
    this.scaleXYZ(s, s, s);
  }

  mult(a, b, out) {
    const m00 = b[8] * a[2] + b[4] * a[1] + b[0] * a[0];
    const m01 = b[9] * a[2] + b[5] * a[1] + b[1] * a[0];
    const m02 = b[10] * a[2] + b[6] * a[1] + b[2] * a[0];
    const m03 = b[11] * a[2] + b[7] * a[1] + b[3] * a[0] + a[3];

    const m10 = b[8] * a[6] + b[4] * a[5] + b[0] * a[4];
    const m11 = b[9] * a[6] + b[5] * a[5] + b[1] * a[4];
    const m12 = b[10] * a[6] + b[6] * a[5] + b[2] * a[4];
    const m13 = b[11] * a[6] + b[7] * a[5] + b[3] * a[4] + a[7];

    const m20 = b[8] * a[10] + b[4] * a[9] + b[0] * a[8];
    const m21 = b[9] * a[10] + b[5] * a[9] + b[1] * a[8];
    const m22 = b[10] * a[10] + b[6] * a[9] + b[2] * a[8];
    const m23 = b[11] * a[10] + b[7] * a[9] + b[3] * a[8] + a[11];

    out[0] = m00; out[1] = m01; out[2] = m02; out[3] = m03;
    out[4] = m10; out[5] = m11; out[6] = m12; out[7] = m13;
    out[8] = m20; out[9] = m21; out[10] = m22; out[11] = m23;
  }

  multRight(mtx) {
    this.mult(this.mtxA, mtx, this.mtxA);
  }

  multLeft(mtx) {
    this.mult(mtx, this.mtxA, this.mtxA);
  }

  fromMtxBMultMtx(mtx) {
    this.mult(this.mtxB, mtx, this.mtxA);
  }

  tfPoint(src, dest) {
    const m = this.mtxA;
    const x = src.x;
    const y = src.y;
    const z = src.z;
    dest.x = m[0] * x + m[1] * y + m[2] * z + m[3];
    dest.y = m[4] * x + m[5] * y + m[6] * z + m[7];
    dest.z = m[8] * x + m[9] * y + m[10] * z + m[11];
  }

  tfVec(src, dest) {
    const m = this.mtxA;
    const x = src.x;
    const y = src.y;
    const z = src.z;
    dest.x = m[0] * x + m[1] * y + m[2] * z;
    dest.y = m[4] * x + m[5] * y + m[6] * z;
    dest.z = m[8] * x + m[9] * y + m[10] * z;
  }

  rigidInvTfPoint(src, dest) {
    const m = this.mtxA;
    const x = src.x - m[3];
    const y = src.y - m[7];
    const z = src.z - m[11];
    dest.x = m[8] * z + m[4] * y + m[0] * x;
    dest.y = m[9] * z + m[5] * y + m[1] * x;
    dest.z = m[10] * z + m[6] * y + m[2] * x;
  }

  rigidInvTfVec(src, dest) {
    const m = this.mtxA;
    const x = src.x;
    const y = src.y;
    const z = src.z;
    dest.x = m[8] * z + m[4] * y + m[0] * x;
    dest.y = m[9] * z + m[5] * y + m[1] * x;
    dest.z = m[10] * z + m[6] * y + m[2] * x;
  }

  rigidInvTfVecXYZ(dest, x, y, z) {
    const m = this.mtxA;
    dest.x = m[8] * z + m[4] * y + m[0] * x;
    dest.y = m[9] * z + m[5] * y + m[1] * x;
    dest.z = m[10] * z + m[6] * y + m[2] * x;
  }

  getTranslateAlt(dest) {
    dest.x = this.mtxA[3];
    dest.y = this.mtxA[7];
    dest.z = this.mtxA[11];
  }

  setTranslate(vec) {
    this.mtxA[3] = vec.x;
    this.mtxA[7] = vec.y;
    this.mtxA[11] = vec.z;
  }

  normalizeBasis() {
    const m = this.mtxA;
    let inv = rsqrt(m[0] * m[0] + m[4] * m[4] + m[8] * m[8]);
    m[0] *= inv; m[4] *= inv; m[8] *= inv;
    inv = rsqrt(m[1] * m[1] + m[5] * m[5] + m[9] * m[9]);
    m[1] *= inv; m[5] *= inv; m[9] *= inv;
    inv = rsqrt(m[2] * m[2] + m[6] * m[6] + m[10] * m[10]);
    m[2] *= inv; m[6] *= inv; m[10] *= inv;
  }

  fromQuat(quat) {
    const m = this.mtxA;
    const x = quat.x;
    const y = quat.y;
    const z = quat.z;
    const w = quat.w;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const yy = y * y2;
    const zz = z * z2;
    const xy = x * y2;
    const xz = x * z2;
    const yz = y * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    m[0] = 1 - (yy + zz);
    m[5] = 1 - (xx + zz);
    m[10] = 1 - (xx + yy);

    m[6] = yz - wx;
    m[9] = yz + wx;
    m[8] = xz - wy;
    m[2] = xz + wy;
    m[1] = xy - wz;
    m[4] = xy + wz;

    m[3] = 0;
    m[7] = 0;
    m[11] = 0;
  }

  toQuat(out) {
    const m = this.mtxA;
    const trace = m[0] + m[5] + m[10];
    if (trace > 0) {
      const s = sqrt(trace + 1.0) * 2;
      out.w = 0.25 * s;
      out.x = (m[9] - m[6]) / s;
      out.y = (m[2] - m[8]) / s;
      out.z = (m[4] - m[1]) / s;
      return;
    }
    if (m[0] > m[5] && m[0] > m[10]) {
      const s = sqrt(1.0 + m[0] - m[5] - m[10]) * 2;
      out.w = (m[9] - m[6]) / s;
      out.x = 0.25 * s;
      out.y = (m[1] + m[4]) / s;
      out.z = (m[2] + m[8]) / s;
      return;
    }
    if (m[5] > m[10]) {
      const s = sqrt(1.0 + m[5] - m[0] - m[10]) * 2;
      out.w = (m[2] - m[8]) / s;
      out.x = (m[1] + m[4]) / s;
      out.y = 0.25 * s;
      out.z = (m[6] + m[9]) / s;
      return;
    }
    const s = sqrt(1.0 + m[10] - m[0] - m[5]) * 2;
    out.w = (m[4] - m[1]) / s;
    out.x = (m[2] + m[8]) / s;
    out.y = (m[6] + m[9]) / s;
    out.z = 0.25 * s;
  }

  toEulerYXZ(outY, outX, outZ) {
    const forward = this.tmpForward;
    const up = this.tmpUp;
    forward.x = 0;
    forward.y = 0;
    forward.z = -1;
    up.x = 0;
    up.y = 1;
    up.z = 0;
    this.push();
    this.tfVec(forward, forward);
    this.tfVec(up, up);
    const rotX = atan2S16(forward.y, sqrt(sumSq2(forward.x, forward.z)));
    const rotY = atan2S16(forward.x, forward.z) - 0x8000;
    this.fromRotateY(rotY);
    this.rotateX(rotX);
    this.rigidInvTfVec(up, up);
    const rotZ = -atan2S16(up.x, up.y);
    this.pop();
    outY.value = rotY;
    outX.value = rotX;
    outZ.value = rotZ;
  }

  push() {
    let slot = this.stack[this.stackTop];
    if (!slot) {
      slot = new Float32Array(12);
      this.stack[this.stackTop] = slot;
    }
    slot.set(this.mtxA);
    this.stackTop += 1;
  }

  pop() {
    if (this.stackTop === 0) {
      return;
    }
    this.stackTop -= 1;
    this.mtxA.set(this.stack[this.stackTop]);
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
