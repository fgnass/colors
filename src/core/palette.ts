// The palette generator: five roles sampled from the fitted model.
//
// Lightness and relative chroma of main, companion and anchor come from a
// Gaussian copula (empirical marginals and their correlations). Hues come from
// the dataset's hue preference for the main color and from the offset
// distributions for the other two. Light and dark are derived tints.
import { clamp, cusp, distance, hueDiff, maxChroma, snap, toGamut, wrapHue, type Lch } from "./color.ts";
import { normCdf, quantileAt, sampleScores, type Copula } from "./copula.ts";
import { driftAt, families, nearestFamily, neutrals } from "./families.ts";
import { chance, sampleQuantiles, sampleWeighted, type Rng } from "./random.ts";
import params from "./params.ts";

export const ROLES = ["main", "companion", "anchor", "light", "dark"] as const;
export type Role = (typeof ROLES)[number];
export type Palette = Record<Role, Lch>;
/** The sampled colors. Light and dark are derived from the main, so they cannot be locked. */
export const CORE = ["main", "companion", "anchor"] as const;
export type Lockable = (typeof CORE)[number];
export type Locks = Partial<Record<Lockable, Lch>>;

const P = params;
const CAP = P.chromaCap;
const copula = P.copula as Copula;

/** Relative chroma: the share of the in-gamut maximum at that lightness and hue. */
const relOf = (c: Lch) => {
  const m = maxChroma(c.l, c.h);
  return m > 1e-4 ? Math.min(1, c.c / m) : 0;
};
const colorOf = (l: number, h: number, rel: number): Lch => ({ l, h, c: Math.min(CAP, rel * maxChroma(l, h)) });

const freeRoles = (locks: Locks): Lockable[] => CORE.filter((r) => !locks[r]);

/** The main hue, conditional on its lightness: yellows are light, blues and reds dark. */
function sampleHue(rng: Rng, l: number): number {
  const { edges, weights } = P.main.hueByL;
  const w = weights[edges.filter((e) => l >= e).length];
  return (sampleWeighted(rng, w) + rng()) * (360 / w.length);
}

// Structural rules the correlations alone do not capture, calibrated by the
// fidelity test: two or more neutrals are rare, and the anchor is the
// lightness pole of main, companion and anchor.
const ACCEPT_TWO_NEUTRALS = 0.35;
const ACCEPT_ANCHOR_INSIDE = 0.4;
const MAX_TRIES = 16;

function plausibility(p: Palette): number {
  const core = [p.main, p.companion, p.anchor];
  let a = 1;
  if (core.filter((c) => c.c < P.neutralC).length >= 2) a *= ACCEPT_TWO_NEUTRALS;
  const { l } = p.anchor;
  if (l < Math.max(p.main.l, p.companion.l) && l > Math.min(p.main.l, p.companion.l)) a *= ACCEPT_ANCHOR_INSIDE;
  return a;
}

/**
 * The limits of the data: no pure black or white. Lightness stays inside the
 * measured range, and near-greys get the measured tint (cool darks, warm lights).
 */
export function refine(c: Lch): Lch {
  const l = Math.min(Math.max(c.l, neutrals.black.Lmin), 0.985);
  if (c.c >= 0.006) return { ...c, l };
  if (l < 0.35) return { l, h: neutrals.black.tintHue, c: neutrals.black.tintC };
  if (l > 0.9) return { l, h: neutrals.white.tintHue, c: Math.max(neutrals.white.tintC, 0.006) };
  return { ...c, l };
}

/** A tint or shade of a color that keeps its chroma ratio and follows the hue drift of its family. */
export function shift(base: Lch, l: number, chromaFactor: number): Lch {
  const h = wrapHue(base.h + driftAt(base.h) * (l - base.l));
  return { l, h, c: Math.min(CAP, base.c * chromaFactor, maxChroma(l, h)) };
}

// ---------- neon ----------
// A neon color is very light and at (almost) the gamut edge.

/** Light, and close to the cusp of its hue, so a mid-light yellow-green (olive) is not neon. */
export function isNeon(c: Lch): boolean {
  return (
    c.l >= P.neon.minL &&
    c.c >= P.neon.minC &&
    relOf(c) >= P.neon.minRel &&
    Math.abs(c.l - cusp(c.h).l) <= P.neon.cuspDL
  );
}

/**
 * Hues at which the data has neons at least as often as on average: red-pink
 * to green. The measured share per bin is interpolated between bin centers.
 * Magentas, violets, blues and cyans are rare as neons, and their neons look off.
 */
const NEON_BINS = P.neon.hueWeights;
const NEON_MIN_WEIGHT = 1 / NEON_BINS.length;
/** Where the neon hues start on the pink side: a hot pink, before it turns magenta. The data's bins are too coarse here. */
const NEON_PINK_FROM = 350;

export function neonHue(h: number): boolean {
  if (wrapHue(h) >= NEON_PINK_FROM) return true;
  const x = wrapHue(h) / (360 / NEON_BINS.length) - 0.5;
  const i = Math.floor(x);
  const at = (k: number) => NEON_BINS[(k + NEON_BINS.length) % NEON_BINS.length];
  return at(i) + (at(i + 1) - at(i)) * (x - i) >= NEON_MIN_WEIGHT;
}

/** How far a hue may move into the neon hues: a magenta becomes a hot pink, a violet stays without neon. */
const NEON_MAX_HUE_SHIFT = 40;
/** The chroma cap of a neon, above the data's cap. */
const NEON_CAP = 0.32;

/** The nearest neon hue within reach, or the hue itself if it is one. */
function neonHueNear(h: number): number | undefined {
  for (let d = 0; d <= NEON_MAX_HUE_SHIFT; d++) for (const x of [h - d, h + d]) if (neonHue(x)) return wrapHue(x);
  return undefined;
}

/**
 * The neon of a color: its hue at full strength, the most colorful point the
 * hue has in sRGB (its cusp). A hue near the neon hues moves to their edge first.
 */
export function toNeon(c: Lch): Lch | undefined {
  const h = neonHueNear(c.h);
  if (h === undefined) return undefined;
  const top = cusp(h);
  return toGamut({ l: top.l, h, c: Math.min(NEON_CAP, top.c) });
}

// ---------- mood ----------
// One setting from muted to vivid that stays inside the dataset. It moves a
// color's relative chroma within its measured distribution (the copula's
// marginal) by shifting its normal score. So the muted end gives what the
// dataset's least vivid palettes have, never greyer, and the vivid end what
// its most vivid ones have. Toward vivid, only one or two accents move up
// (toward the cusp of their hue, neon at the end); the others move down a
// little, so at most two colors are vivid, as in the data. Toward muted, the
// lightness range widens, as in the data's least vivid palettes.
// The mood is applied to a palette drawn without it, and each color changes
// continuously with it: moving the setting never draws other colors.

const MUTED_SHIFT = 1.1; // normal-score shift of every color at the muted end
/** The dataset's least vivid palettes make up with contrast: their lightness range is about 1.2× the average. */
const MUTED_CONTRAST = 0.2;
const ACCENT_SHIFT = 2.5; // normal-score shift of the accents at the vivid end
const HELD_BACK_SHIFT = 1; // of the others at the vivid end (downward)
const TWO_ACCENTS = 0.4; // chance that a palette has a second accent
/** How much more a lightness change counts than a color change when choosing the color to make neon. */
const NEON_L_WEIGHT = 2;

export interface Options {
  /** -1 muted … 0 as in the data … 1 vivid */
  mood?: number;
  /** a stream for the mood's own choices, so the setting does not move other colors */
  moodRng?: Rng;
  /**
   * hue families (see HUE_FAMILIES) the palette must contain, each in its own
   * color; the same one twice asks for a monochrome palette
   */
  families?: string[];
  /** the most colorful free color becomes a neon, the rest stays as it is */
  neon?: boolean;
}

/** Relative chroma at normal score z, moved by `shift` standard deviations, in the role's measured distribution. */
function relAt(role: Lockable, z: number, by: number): number {
  return quantileAt(copula.marginals[copula.vars.indexOf(`${role}.crel`)], normCdf(z + by));
}

function applyMood(role: Lockable, c: Lch, z: number, accent: boolean, m: number): Lch {
  if (m < 0) return colorOf(c.l, c.h, relAt(role, z, MUTED_SHIFT * m));
  if (!accent) return colorOf(c.l, c.h, relAt(role, z, -HELD_BACK_SHIFT * m));
  const l = c.l + (cusp(c.h).l - c.l) * m;
  return { l, h: c.h, c: Math.min(CAP + (NEON_CAP - CAP) * m, relAt(role, z, ACCENT_SHIFT * m) * maxChroma(l, c.h)) };
}

// ---------- hue families ----------
// "A palette with blue in it": the model conditioned on containing a color
// of that family, by rejection sampling. Any role can carry it. Two families
// make a two-hue palette: every clearly colored color is of one of them
// (neutrals allowed), each in its own color. The same family twice means
// monochrome: every clearly colored color is of that family, at least two.

/** The hue families (basic color terms), by hue. */
export const HUE_FAMILIES = [...families].sort((a, b) => a.hue - b.hue).map((f) => ({ name: f.name, hue: f.hue }));
const FAMILY_INDEX = new Map(HUE_FAMILIES.map((f, i) => [f.name, i]));

/** The index of a family in HUE_FAMILIES, as links store it. */
export const familyIndex = (name: string): number | undefined => FAMILY_INDEX.get(name);
const hueOfFamily = (name: string) => HUE_FAMILIES[FAMILY_INDEX.get(name)!].hue;

/** Clearly colored, not a tinted neutral. */
const FAMILY_MIN_C = 0.05;
const FAMILY_TRIES = 1500;

const carries = (c: Lch, family: string) => c.c >= FAMILY_MIN_C && nearestFamily(c.h).name === family;
const carriesAny = (c: Lch, fams: string[]) => fams.some((f) => carries(c, f));
const isMono = (fams: string[]) => fams.length === 2 && fams[0] === fams[1];

function fits(p: Palette, fams: string[]): boolean {
  if (fams.length === 0) return true;
  const colored = CORE.filter((r) => p[r].c >= FAMILY_MIN_C);
  if (isMono(fams)) return colored.length >= 2 && colored.every((r) => carries(p[r], fams[0]));
  if (fams.length === 2) {
    const onlyThese = colored.every((r) => carriesAny(p[r], fams));
    const eachInItsOwn = CORE.some((a) =>
      CORE.some((b) => a !== b && carries(p[a], fams[0]) && carries(p[b], fams[1])),
    );
    return onlyThese && eachInItsOwn;
  }
  return CORE.some((r) => carries(p[r], fams[0]));
}

/** A hue of the family, uniform between the midpoints to its neighbours. */
function familyHue(rng: Rng, family: string): number {
  const i = FAMILY_INDEX.get(family)!;
  const n = HUE_FAMILIES.length;
  const [prev, f, next] = [HUE_FAMILIES[(i + n - 1) % n], HUE_FAMILIES[i], HUE_FAMILIES[(i + 1) % n]];
  const lo = f.hue - wrapHue(f.hue - prev.hue) / 2;
  const hi = f.hue + wrapHue(next.hue - f.hue) / 2;
  return wrapHue(lo + rng() * (hi - lo));
}

/**
 * A rare combination (with locks, for example) that rejection sampling did
 * not reach: free colors are turned to the families by hand.
 */
function force(draft: Draft, locks: Locks, fams: string[], rng: Rng): Draft {
  const p = finish(draft, locks);
  const free = freeRoles(locks).sort((a, b) => draft[b].c - draft[a].c);
  let d = draft;
  const turn = (r: Lockable, f: string) => {
    d = { ...d, [r]: { ...d[r], h: familyHue(rng, f), c: Math.max(d[r].c, FAMILY_MIN_C + 0.02) } };
  };
  if (isMono(fams)) {
    let n = CORE.filter((r) => locks[r] && carries(p[r], fams[0])).length;
    for (const r of free) {
      if (p[r].c >= FAMILY_MIN_C || n < 2) {
        turn(r, fams[0]);
        n++;
      }
    }
    return d;
  }
  // Each family takes a color that already carries it, else a free color of no family.
  const used = new Set<Lockable>();
  for (const f of fams) {
    const has = CORE.find((r) => !used.has(r) && carries(p[r], f));
    const r = has ?? free.find((x) => !used.has(x) && !carriesAny(p[x], fams));
    if (!r) continue;
    used.add(r);
    if (!has) turn(r, f);
  }
  // With two families, the other clearly colored free colors turn to the nearer one.
  if (fams.length === 2) {
    for (const r of free) {
      if (used.has(r) || p[r].c < FAMILY_MIN_C || carriesAny(p[r], fams)) continue;
      const nearer = fams.reduce((a, b) =>
        Math.abs(hueDiff(d[r].h, hueOfFamily(a))) <= Math.abs(hueDiff(d[r].h, hueOfFamily(b))) ? a : b,
      );
      turn(r, nearer);
    }
  }
  return d;
}

// ---------- generation ----------

/** Main, companion and anchor before the mood and the limits, plus the tint amounts. */
interface Draft {
  main: Lch;
  companion: Lch;
  anchor: Lch;
  lt: number;
  dt: number;
  /** normal scores of the relative chromas, where the mood moves them */
  z: Record<Lockable, number>;
}

export function generatePalette(rng: Rng, locks: Locks = {}, options: Options = {}): Palette {
  return generatePalettes(rng, locks, options).palette;
}

/**
 * The palette with the mood and neon applied; the same palette without both
 * (`base`), for what should not follow the mood; and with the mood but
 * without neon (`plain`), for choices that should not change when neon is on.
 */
export function generatePalettes(
  rng: Rng,
  locks: Locks = {},
  { mood = 0, moodRng, families: wanted = [], neon = false }: Options = {},
): { palette: Palette; base: Palette; plain: Palette } {
  const fams = wanted.filter((f) => FAMILY_INDEX.has(f)).slice(0, 2);
  const draft = draftWithFamilies(rng, locks, fams);
  const base = finish(draft, locks);
  const m = clamp(mood, -1, 1);
  // Drawn at every mood, so a palette's accents are the same at every setting.
  const twoAccents = chance(moodRng ?? rng, TWO_ACCENTS);
  const plain = m ? finish(applyMoodTo(draft, base, locks, fams, m, twoAccents), locks) : base;
  const palette = neon ? withNeon(plain, draft, locks, fams) : plain;
  return { palette, base, plain };
}

/** A draft that fits the families: by rejection sampling, forced if that fails. */
function draftWithFamilies(rng: Rng, locks: Locks, fams: string[]): Draft {
  let d = generate(rng, locks);
  for (let i = 0; i < FAMILY_TRIES && !fits(finish(d, locks), fams); i++) d = generate(rng, locks);
  return fits(finish(d, locks), fams) ? d : force(d, locks, fams, rng);
}

/** The draft with the mood applied to its free colors. */
function applyMoodTo(d: Draft, base: Palette, locks: Locks, fams: string[], m: number, twoAccents: boolean): Draft {
  // The accents: the free colors that are visibly the most colorful, a color of a chosen family before all.
  const rank = (r: Lockable) => base[r].c + (carriesAny(base[r], fams) ? 1 : 0);
  const free = freeRoles(locks);
  const accents = [...free].sort((a, b) => rank(b) - rank(a)).slice(0, twoAccents ? 2 : 1);
  if (m < 0) d = spreadLightness(d, free, m);
  const moved = (role: Lockable) =>
    locks[role] ? d[role] : applyMood(role, d[role], d.z[role], accents.includes(role), m);
  return { ...d, main: moved("main"), companion: moved("companion"), anchor: moved("anchor") };
}

/** Toward muted, the free colors move away from the mean lightness, but never past 0.12 / 0.97. A color already beyond stays. */
function spreadLightness(d: Draft, free: Lockable[], m: number): Draft {
  const mid = (d.main.l + d.companion.l + d.anchor.l) / 3;
  const spread = (l: number) =>
    Math.min(Math.max(0.97, l), Math.max(Math.min(0.12, l), mid + (l - mid) * (1 - MUTED_CONTRAST * m)));
  for (const r of free) d = { ...d, [r]: { ...d[r], l: spread(d[r].l) } };
  return d;
}

/**
 * The neon splash: of the free colors in a neon hue, the one closest to its
 * own neon becomes it, a color of a chosen family first. A change of
 * lightness counts more than one of color, because it changes the palette's structure.
 */
function withNeon(plain: Palette, d: Draft, locks: Locks, fams: string[]): Palette {
  const tweak = (c: Lch, n: Lch) => Math.hypot(distance(c, { ...n, l: c.l }), NEON_L_WEIGHT * (n.l - c.l));
  const cost = ({ r, n }: { r: Lockable; n: Lch }) => tweak(plain[r], n) - (carriesAny(plain[r], fams) ? 1 : 0);
  const candidates = freeRoles(locks).flatMap((r) => {
    const n = toNeon(plain[r]);
    return n ? [{ r, n }] : [];
  });
  const pick = candidates.sort((a, b) => cost(a) - cost(b))[0];
  if (!pick) return plain;
  return finish({ ...d, main: plain.main, companion: plain.companion, anchor: plain.anchor, [pick.r]: pick.n }, locks);
}

function generate(rng: Rng, locks: Locks): Draft {
  let d = sampleDraft(rng, locks);
  for (let i = 1; i < MAX_TRIES && rng() > plausibility(finish(d, locks)); i++) d = sampleDraft(rng, locks);
  return d;
}

function sampleDraft(rng: Rng, locks: Locks): Draft {
  const known: Record<string, number> = {};
  for (const [role, c] of Object.entries(locks) as [Lockable, Lch][]) {
    known[`${role}.l`] = c.l;
    known[`${role}.crel`] = relOf(c);
  }
  const { values: v, z } = sampleScores(copula, rng, known);
  const mainHue = locks.main?.h ?? sampleHue(rng, v["main.l"]);
  const main = locks.main ?? colorOf(v["main.l"], mainHue, v["main.crel"]);
  const compHue = wrapHue(main.h + sampleQuantiles(rng, P.companion.dHue));
  const companion = locks.companion ?? colorOf(v["companion.l"], compHue, v["companion.crel"]);

  let anchorHue = wrapHue(main.h + sampleQuantiles(rng, P.anchor.dHue));
  const anchorL = v["anchor.l"];
  // Very light, almost neutral anchors lean to cream in the data.
  if (!locks.anchor && anchorL > 0.9 && v["anchor.crel"] < 0.5 && chance(rng, P.anchor.light.creamP)) {
    anchorHue = sampleQuantiles(rng, P.anchor.light.creamHue);
  }
  const anchor = locks.anchor ?? colorOf(anchorL, anchorHue, v["anchor.crel"]);
  return {
    main,
    companion,
    anchor,
    lt: sampleQuantiles(rng, P.tints.lightT),
    dt: sampleQuantiles(rng, P.tints.darkT),
    z: { main: z["main.crel"], companion: z["companion.crel"], anchor: z["anchor.crel"] },
  };
}

/** The palette: the limits applied (not to locked colors) and the tints derived. */
function finish({ main, companion, anchor, lt, dt }: Draft, locks: Locks): Palette {
  const keep = (role: Lockable, c: Lch) => (locks[role] ? c : refine(c));
  return {
    main: snap(keep("main", main)),
    companion: snap(keep("companion", companion)),
    anchor: snap(keep("anchor", anchor)),
    light: snap(refine(shift(main, main.l + lt * (1 - main.l), P.tints.lightC))),
    dark: snap(refine(shift(main, main.l - dt * main.l, P.tints.darkC))),
  };
}
