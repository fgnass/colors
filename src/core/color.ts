// OKLCH <-> sRGB conversion, gamut mapping and contrast.

export interface Lch {
  l: number; // 0..1
  c: number; // chroma
  h: number; // degrees
}

const srgbToLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export const wrapHue = (h: number) => ((h % 360) + 360) % 360;
/** signed hue difference b - a in -180..180 */
export const hueDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function lchToLinRgb({ l, c, h }: Lch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

export function inGamut(lch: Lch): boolean {
  return lchToLinRgb(lch).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

const maxChromaCache = new Map<number, number>();
/**
 * Highest in-gamut sRGB chroma for a lightness and hue, at 0.001 lightness
 * and 0.5° hue: made for the rounded values, so the result doesn't depend on
 * which nearby color filled the cache first.
 */
export function maxChroma(l: number, h: number): number {
  const lk = Math.round(clamp(l, 0, 1) * 1000);
  const hk = Math.round(wrapHue(h) * 2);
  const key = lk * 1000 + hk;
  const hit = maxChromaCache.get(key);
  if (hit !== undefined) return hit;
  l = lk / 1000;
  h = hk / 2;
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ l, c: mid, h })) lo = mid;
    else hi = mid;
  }
  maxChromaCache.set(key, lo);
  return lo;
}

const cuspCache = new Map<number, { l: number; c: number }>();
/** The most chromatic in-gamut color of a hue: its lightness and chroma. */
export function cusp(h: number): { l: number; c: number } {
  const key = Math.round(wrapHue(h) * 2);
  const hit = cuspCache.get(key);
  if (hit) return hit;
  h = key / 2;
  let best = { l: 0, c: 0 };
  for (let i = 30; i < 100; i++) {
    const c = maxChroma(i / 100, h);
    if (c > best.c) best = { l: i / 100, c };
  }
  cuspCache.set(key, best);
  return best;
}

/** Reduce chroma until the color fits into sRGB. */
export function toGamut(lch: Lch): Lch {
  const l = clamp(lch.l, 0, 1);
  const h = wrapHue(lch.h);
  return { l, h, c: clamp(Math.min(lch.c, maxChroma(l, h)), 0, 0.4) };
}

export function toHex(lch: Lch): string {
  const rgb = lchToLinRgb(toGamut(lch)).map((v) => Math.round(clamp(linToSrgb(clamp(v, 0, 1)), 0, 1) * 255));
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function fromHex(hex: string): Lch {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => srgbToLin(parseInt(h.slice(i, i + 2), 16) / 255));
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L, c: Math.hypot(A, B), h: wrapHue((Math.atan2(B, A) * 180) / Math.PI) };
}

/** Round-trip through sRGB hex so all values describe a displayable color. */
export const snap = (lch: Lch): Lch => fromHex(toHex(lch));

/** OKLab distance: a vivid color stands out from a pale one even at equal lightness */
export function distance(a: Lch, b: Lch): number {
  const ab = (c: Lch) => [c.l, c.c * Math.cos((c.h * Math.PI) / 180), c.c * Math.sin((c.h * Math.PI) / 180)];
  const [x, y] = [ab(a), ab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export const cssOklch = ({ l, c, h }: Lch) => `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`;

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => srgbToLin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** APCA lightness contrast Lc (text on background), 0.0.98G constants */
export function apca(text: string, bg: string): number {
  const y = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255) ** 2.4);
    const v = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return v < 0.022 ? v + (0.022 - v) ** 1.414 : v;
  };
  const yt = y(text);
  const yb = y(bg);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}
