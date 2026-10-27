// Hue families (named by the basic color terms), the hue drift (by rule) and
// the near-white / near-black rule.
import { hueDiff, maxChroma, wrapHue } from "./color.ts";
import params from "./params.ts";

export interface Family {
  name: string;
  hue: number;
}

export const families: Family[] = params.families;
export const neutrals = params.neutrals;

// ---------- hue drift, by rule ----------
// Every hue is most colorful at its own lightness, the cusp of the sRGB gamut
// (yellow near white, blue low). A color that darkens turns a little toward
// the neighbouring hue whose cusp is darker, and one that lightens toward the
// lighter one, so it keeps its color instead of turning muddy: yellow darkens
// toward orange, orange toward red, blue toward indigo and lightens toward sky.
// The drift follows the slope of the cusp lightness over hue, weighted by how
// high the cusp is: a hue whose cusp is high (yellow) cannot be colorful when
// dark and needs to turn; one whose cusp is at mid lightness (purple, blue,
// red) stays colorful and barely turns. Compressed so it never exceeds DRIFT_MAX.

const DRIFT_STRENGTH = 27000; // degrees of drift per unit of cusp slope (°/L per L/°), before compression
const DRIFT_MAX = 90; // degrees per 1.0 of lightness
const DRIFT_FROM = 0.57; // cusp lightness at which the weight starts …
const DRIFT_FULL = 0.74; // … and where it is full

/** lightness of the most chromatic color of a hue (ternary search, the chroma is unimodal in L) */
function cuspL(h: number): number {
  let lo = 0.25;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (maxChroma(a, h) < maxChroma(b, h)) lo = a;
    else hi = b;
  }
  return (lo + hi) / 2;
}

const DRIFT = Array.from({ length: 360 }, (_, h) => {
  const slope = (cuspL(h + 4) - cuspL(h - 4)) / 8;
  const weight = Math.min(1, Math.max(0, (cuspL(h) - DRIFT_FROM) / (DRIFT_FULL - DRIFT_FROM)));
  return DRIFT_MAX * Math.tanh((DRIFT_STRENGTH * slope * weight) / DRIFT_MAX);
});

/** Hue drift (degrees per unit lightness) at a hue. */
export function driftAt(h: number): number {
  const x = wrapHue(h);
  const i = Math.floor(x);
  const t = x - i;
  return DRIFT[i] * (1 - t) + DRIFT[(i + 1) % 360] * t;
}

export function nearestFamily(h: number): Family {
  return families.reduce((best, f) => (Math.abs(hueDiff(h, f.hue)) < Math.abs(hueDiff(h, best.hue)) ? f : best));
}
