// Canvas colors: alternatives to white (paper) and black (ink).
//
// Each canvas tint comes from one source, with the probabilities measured
// from the near-neutral colors of the dataset: plain grey, cream, cool,
// warm, or a faint version of the main or companion hue.
import { CLEARLY_COLORED, clamp, fromAb, hueDiff, maxChroma, snap, toLab, wrapHue, type Lch } from "./color.ts";
import type { Palette } from "./palette.ts";
import { sampleQuantiles, sampleWeighted, type Rng } from "./random.ts";
import params from "./params.ts";

export interface Canvases {
  paper: Lch;
  ink: Lch;
}
export type CanvasKind = keyof Canvases;

export const isCanvas = (role: string): role is CanvasKind => role === "paper" || role === "ink";

interface Source {
  p: number;
  L: number[];
  C: number[];
  hue?: number[];
}

const MODEL = params.canvas as Record<"light" | "dark", Record<string, Source>>;

/** Usable lightness for an interface background. The ink floor is the darkest sampled near-black. */
const RANGE = { paper: [0.96, 0.99], ink: [0.15, 0.28] } as const;
/**
 * The measured near-whites go down to about 0.9. That is fine for a colored
 * surface but too dark for an app background, so paper lightness is mapped
 * from this measured span into RANGE.paper instead of being clipped. The
 * variety of the data stays.
 */
const PAPER_DATA = [0.9, 1] as const;
const MAX_C = { paper: 0.045, ink: 0.06 } as const;

export function sampleCanvas(rng: Rng, kind: CanvasKind, p: Palette): Lch {
  const model = MODEL[kind === "paper" ? "light" : "dark"];
  const names = Object.keys(model);
  const weights = names.map((n) => model[n].p);
  const src = names[sampleWeighted(rng, weights)];
  const m = model[src];
  const sampled = sampleQuantiles(rng, m.L);
  const [lo, hi] = RANGE[kind];
  const l =
    kind === "paper"
      ? lo + (hi - lo) * clamp((sampled - PAPER_DATA[0]) / (PAPER_DATA[1] - PAPER_DATA[0]), 0, 1)
      : clamp(sampled, lo, hi);
  const sampledHue = m.hue ? sampleQuantiles(rng, m.hue) : src === "companion" ? p.companion.h : p.main.h;
  // A cream, cool or warm tint takes the nearest hue of a colored palette color,
  // so paper, ink and the neutral scale stay in the palette's family.
  const hues = [p.main, p.companion, p.anchor].filter((c) => c.c >= CLEARLY_COLORED).map((c) => c.h);
  const h = hues.length
    ? hues.reduce((a, b) => (Math.abs(hueDiff(sampledHue, b)) < Math.abs(hueDiff(sampledHue, a)) ? b : a))
    : sampledHue;
  const c = src === "grey" ? sampleQuantiles(rng, m.C) * 0.5 : sampleQuantiles(rng, m.C);
  return snap({ l, h: wrapHue(h), c: Math.min(c, MAX_C[kind], maxChroma(l, h)) });
}

export function sampleCanvases(rng: Rng, p: Palette, locks: Partial<Canvases> = {}): Canvases {
  const paper = sampleCanvas(rng, "paper", p);
  const ink = sampleCanvas(rng, "ink", p);
  return { paper: locks.paper ?? paper, ink: locks.ink ?? ink };
}

/** A neutral at lightness l that carries exactly the tint of one canvas. */
export function tintAt(l: number, canvas: Lch): Lch {
  return snap({ l, h: canvas.h, c: Math.min(canvas.c, maxChroma(l, canvas.h)) });
}

/**
 * The neutral scale keeps only a hint of the canvas tint, so it never copies
 * a palette color.
 */
const NEUTRAL_MAX_C = 0.015;

/**
 * A neutral at lightness l between ink and paper. The tint is interpolated
 * in OKLab, not along the hue circle, so a cool ink and a cream paper meet
 * in grey instead of passing through green.
 */
export function neutralAt(l: number, { paper, ink }: Canvases): Lch {
  const t = clamp((l - ink.l) / Math.max(paper.l - ink.l, 1e-3), 0, 1);
  const [, ai, bi] = toLab(ink);
  const [, ap, bp] = toLab(paper);
  const { c, h } = fromAb(ai + (ap - ai) * t, bi + (bp - bi) * t);
  return snap({ l, h, c: Math.min(c, NEUTRAL_MAX_C, maxChroma(l, h)) });
}
