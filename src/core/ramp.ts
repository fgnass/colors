// Interface scales (50 … 950) derived from a palette color.
import { cusp, fromAb, hueDiff, maxChroma, snap, toLab, type Lch } from "./color.ts";
import { neutralAt, type Canvases } from "./canvas.ts";
import { shift } from "./palette.ts";
import params from "./params.ts";

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];
export type Ramp = Record<Step, Lch>;

/**
 * Perceptual lightness per step. The steps are closer at the light end, where
 * interface backgrounds need fine control, and end at the lifted black of the data.
 */
const LIGHTNESS: Record<Step, number> = {
  50: 0.975,
  100: 0.945,
  200: 0.89,
  300: 0.82,
  400: 0.73,
  500: 0.64,
  600: 0.555,
  700: 0.475,
  800: 0.395,
  900: 0.315,
  950: 0.235,
};

/**
 * Chroma profile over lightness, relative to the peak of a scale: full in
 * the middle, falling off steeply toward white and gently toward black.
 */
function profile(l: number): number {
  if (l > 0.7) return Math.max(0.1, 1 - ((l - 0.7) / 0.28) * 0.9);
  if (l < 0.45) return 1 - ((0.45 - l) / 0.25) * 0.4;
  return 1;
}

/**
 * A pale color says little about how colorful its scale may get, so the peak
 * is never extrapolated from the faint end of the profile.
 */
const PROFILE_FLOOR = 0.12;

/**
 * The step a color sits at. By lightness, but a colorful color needs paler
 * steps above it: a vivid lime is no 100, however light it is. At least
 * 1 + 2 × chroma / cusp chroma steps lie above it, so a pale tint sits at 100
 * or lower and a color at the gamut edge at 300 or lower. Never 50, which
 * stays the near-white above the color.
 */
export const nearestStep = (c: Lch): Step => {
  const byL = STEPS.reduce((best, s) => (Math.abs(LIGHTNESS[s] - c.l) < Math.abs(LIGHTNESS[best] - c.l) ? s : best));
  // Chroma relative to the most the hue can have anywhere, so a trace of color near white stays a trace.
  const rel = Math.min(1, c.c / Math.max(cusp(c.h).c, 1e-4));
  const minAbove = Math.max(1, Math.round(1 + 2 * rel));
  return STEPS[Math.max(STEPS.indexOf(byL), minAbove)];
};

/**
 * Lightness of each step around a color at `home`: the default curve, bent so
 * the color sits at its own lightness. The steps above share the room up to
 * the near-white, the steps below the room down to the darkest step.
 */
function stepLightness(s: Step, home: Step, l: number): number {
  const top = Math.max(LIGHTNESS[50], (l + 1) / 2);
  const bottom = LIGHTNESS[950];
  const L = LIGHTNESS;
  if (s === home) return l;
  if (L[s] > L[home]) return l + ((top - l) * (L[s] - L[home])) / (L[50] - L[home]);
  return bottom + ((l - bottom) * (L[s] - bottom)) / (L[home] - bottom);
}

// Palette pull. On top of the hue drift, which only knows the color space,
// the dark steps lean toward the palette's darkest color, the way a palette
// darkens into its own dark rather than into brown or grey. The pull grows
// from PULL_FROM down to the darkest step.
const PULL = 1.5; // weight per unit of depth (0 at PULL_FROM, 1 at step 950)
const PULL_MAX = 0.85;
const PULL_FROM = 0.6;
const PULL_HUE_FULL = 60; // degrees apart with the full pull …
const PULL_HUE_ZERO = 120; // … and with none

/** Blend b into a in OKLab a/b, at a's lightness. */
function lean(a: Lch, b: Lch, w: number): Lch {
  const [, xa, ya] = toLab(a);
  const [, xb, yb] = toLab(b);
  const { c, h } = fromAb(xa + (xb - xa) * w, ya + (yb - ya) * w);
  return { l: a.l, h, c: Math.min(c, maxChroma(a.l, h)) };
}

/**
 * A scale through the color, which sits at its nearest step. `dark` is the
 * palette's darkest color, when the scale should lean into it.
 */
export function ramp(color: Lch, dark?: Lch): Ramp {
  const home = nearestStep(color);
  // The chroma profile follows the steps, bent like the lightness, not the bare lightness.
  const peak = Math.min(params.chromaCap, color.c / Math.max(profile(LIGHTNESS[home]), PROFILE_FLOOR));
  const out = {} as Ramp;
  for (const s of STEPS) {
    if (s === home) {
      out[s] = color;
      continue;
    }
    const l = stepLightness(s, home, color.l);
    const { h } = shift(color, l, 1);
    let c: Lch = { l, h, c: Math.min(peak * profile(LIGHTNESS[s]), maxChroma(l, h)) };
    if (dark && l < PULL_FROM && l < color.l) {
      // Only toward a neighbouring hue: across the color circle the mix would pass through grey.
      const near = Math.max(
        0,
        Math.min(1, (PULL_HUE_ZERO - Math.abs(hueDiff(color.h, dark.h))) / (PULL_HUE_ZERO - PULL_HUE_FULL)),
      );
      const w = near * Math.min(PULL_MAX, (PULL * (PULL_FROM - l)) / (PULL_FROM - LIGHTNESS[950]));
      // The dark color as it would look at this lightness.
      const darkHere = { l, h: dark.h, c: Math.min((dark.c * profile(l)) / profile(dark.l), maxChroma(l, dark.h)) };
      c = lean(c, darkHere, w);
    }
    out[s] = snap(c);
  }
  return out;
}

/** The neutral scale, spanned between the ink and paper canvases. */
export function neutralRamp(canvases: Canvases): Ramp {
  const out = {} as Ramp;
  for (const s of STEPS) out[s] = neutralAt(LIGHTNESS[s], canvases);
  return out;
}
