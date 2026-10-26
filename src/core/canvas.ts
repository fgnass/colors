// Canvas colors: alternatives to white (paper) and black (ink).
//
// Each canvas tint comes from one source, with the probabilities measured
// from the near-neutral colors of the dataset: plain grey, cream, cool,
// warm, or a faint version of the main or companion hue.
import { clamp, hueDiff, maxChroma, snap, wrapHue, type Lch } from "./color.ts";
import type { Palette } from "./palette.ts";
import { sampleQuantiles, sampleWeighted, type Rng } from "./random.ts";
import params from "./params.json" with { type: "json" };

export interface Canvases {
  paper: Lch;
  ink: Lch;
}
export type CanvasKind = keyof Canvases;

interface Source {
  p: number;
  L: number[];
  C: number[];
  hue?: number[];
}

const MODEL = params.canvas as Record<"light" | "dark", Record<string, Source>>;
// usable lightness for a UI background; the ink floor is the darkest sampled near-black
const RANGE = { paper: [0.96, 0.99], ink: [0.15, 0.28] } as const;
// The measured near-whites go down to ~0.9: fine as a colored surface, too dark
// for an app background. Paper lightness is mapped from this measured span
// into its range (keeping the variety) instead of being clipped.
const PAPER_DATA = [0.9, 1] as const;
const MAX_C = { paper: 0.045, ink: 0.06 } as const;

export function sampleCanvas(rng: Rng, kind: CanvasKind, p: Palette): Lch {
  const model = MODEL[kind === "paper" ? "light" : "dark"];
  const names = Object.keys(model);
  const src = names[sampleWeighted(rng, names.map((n) => model[n].p))];
  const m = model[src];
  const sampled = sampleQuantiles(rng, m.L);
  const [lo, hi] = RANGE[kind];
  const l = kind === "paper"
    ? lo + (hi - lo) * clamp((sampled - PAPER_DATA[0]) / (PAPER_DATA[1] - PAPER_DATA[0]), 0, 1)
    : clamp(sampled, lo, hi);
  const sampledHue = m.hue ? sampleQuantiles(rng, m.hue) : src === "companion" ? p.companion.h : p.main.h;
  // the tint comes from the palette: a cream, cool or warm tint takes the nearest hue of a colored palette color
  const hues = [p.main, p.companion, p.anchor].filter((c) => c.c >= 0.04).map((c) => c.h);
  const h = hues.length ? hues.reduce((a, b) => (Math.abs(hueDiff(sampledHue, b)) < Math.abs(hueDiff(sampledHue, a)) ? b : a)) : sampledHue;
  const c = src === "grey" ? sampleQuantiles(rng, m.C) * 0.5 : sampleQuantiles(rng, m.C);
  return snap({ l, h: wrapHue(h), c: Math.min(c, MAX_C[kind], maxChroma(l, h)) });
}

export function sampleCanvases(rng: Rng, p: Palette, locks: Partial<Canvases> = {}): Canvases {
  const paper = sampleCanvas(rng, "paper", p);
  const ink = sampleCanvas(rng, "ink", p);
  return { paper: locks.paper ?? paper, ink: locks.ink ?? ink };
}

const toAb = (c: Lch) => [c.c * Math.cos((c.h * Math.PI) / 180), c.c * Math.sin((c.h * Math.PI) / 180)];

/** a neutral at lightness l carrying exactly the tint of one canvas */
export function tintAt(l: number, canvas: Lch): Lch {
  return snap({ l, h: canvas.h, c: Math.min(canvas.c, maxChroma(l, canvas.h)) });
}

/**
 * A neutral at lightness l between ink and paper. The tint is interpolated
 * in OKLab (not along the hue circle), so a cool ink and a cream paper meet
 * in grey instead of passing through green. The chroma is capped, so the
 * neutral scale keeps only a hint of the tint and never copies a palette color.
 */
const NEUTRAL_MAX_C = 0.015;

export function neutralAt(l: number, { paper, ink }: Canvases): Lch {
  const t = clamp((l - ink.l) / Math.max(paper.l - ink.l, 1e-3), 0, 1);
  const [ai, bi] = toAb(ink);
  const [ap, bp] = toAb(paper);
  const a = ai + (ap - ai) * t;
  const b = bi + (bp - bi) * t;
  const h = wrapHue((Math.atan2(b, a) * 180) / Math.PI);
  return snap({ l, h, c: Math.min(Math.hypot(a, b), NEUTRAL_MAX_C, maxChroma(l, h)) });
}
