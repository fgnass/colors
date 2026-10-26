// Gradients as one fixed composition, in the palette's colors:
//
//   - the bottom color fills the area,
//   - the glow color fills everything above a soft U-shaped edge (a parabola),
//   - the top color lies over it as a band with a soft, tilted lower edge,
//   - a soft edge is a Gaussian-blurred edge: opacity = Φ(distance / blur),
//   - the layers are composited in sRGB, like in a drawing tool.
//
// The U is deepest left of the middle and flat, the band falls to the left
// and its edge curves toward the sides.
// Stop colors: the palette's own, the most chromatic as the glow, dark on
// top, light at the bottom.
import { toHex, type Lch } from "./color.ts";
import type { Palette, Role } from "./palette.ts";
import { ramp } from "./ramp.ts";

/** lengths in units of the width; y grows downward (a 3:4 area has y up to 4/3) */
export interface Composition {
  bandY: number; // lower edge of the band at the horizontal middle
  bandTilt: number; // how much lower the edge is on the right than on the left
  bandCurve: number;
  bandBlur: number;
  uX: number; // horizontal position of the deepest point of the U
  uDepth: number; // its depth
  uCurve: number; // how fast the U rises toward the sides
  uBlur: number;
}

export interface Gradient {
  top: Lch;
  core: Lch;
  bottom: Lch;
  /** with four colors: the field runs into this color toward the right */
  fourth?: Lch;
  composition: Composition;
}

/** the second field: a linear gradient at this angle (CSS degrees), from the field at FIELD_FROM to the fourth color */
export const FIELD_ANGLE = 100;
export const FIELD_FROM = 0.35;

/** The composition (lengths in units of the width, y downward on a 3:4 area). */
export const COMPOSITION: Composition = {
  bandY: 0.298,
  bandTilt: -0.189,
  bandCurve: 0.3,
  bandBlur: 0.129,
  uX: 0.403,
  uDepth: 0.881,
  uCurve: 0.7722,
  uBlur: 0.144,
};

/**
 * Stop colors, all from the palette, in the roles of the measured stops: the
 * most chromatic color glows, the darkest clearly colored one of the others is
 * the band on top, the lightest the field at the bottom.
 */
/** a glow must stand out above the band: this much lighter */
const GLOW_ABOVE = 0.12;
/** a glow this colorful glows on its own, however dark */
const VIVID = 0.12;
/** a band is dark */
const DARK = 0.5;
/** … but not a near-black, when a darker color with body is there up to this lightness */
const NEAR_BLACK = 0.22;
const DARK_BAND = 0.6;

/**
 * Stop colors from the palette colors in use (`roles`, as on the plate: the
 * main first). With 2, the more colorful one glows and the other is the band
 * or the field, the missing stop a deep or pale step of the glow; with 3 the
 * stops are those three; with 4 or more, the core
 * color left over turns the field into a second field.
 */
export function gradientFrom(p: Palette, roles: Role[] = ["main", "companion", "anchor"]): Gradient {
  const set = [...new Set(roles)].map((r) => p[r]);
  if (set.length <= 2) {
    const [a, b = p.light] = set;
    const glow = b.c > a.c ? b : a;
    const other = glow === a ? b : a;
    const r = ramp(glow);
    return other.l < glow.l
      ? { top: other, core: glow, bottom: r[50], composition: COMPOSITION }
      : { top: r[900], core: glow, bottom: other, composition: COMPOSITION };
  }
  if (set.length === 3) return gradient3(set);
  const g = gradient3([p.main, p.companion, p.anchor, p.light, p.dark]);
  const used = [g.top, g.core, g.bottom];
  const fourth = [p.main, p.companion, p.anchor].find((c) => !used.includes(c) && c.c >= 0.04)
    ?? [p.light, p.dark].filter((c) => !used.includes(c)).sort((a, b) => b.c - a.c)[0];
  return { ...g, fourth };
}

function gradient3(colors: Lch[]): Gradient {
  const byL = [...colors].sort((a, b) => a.l - b.l);
  const lightest = byL[byL.length - 1];
  const darkestColored = byL.find((c) => c.c >= 0.04);
  const best = (cs: Lch[]) => cs.reduce<Lch | undefined>((a, b) => (!a || b.c > a.c ? b : a), undefined);
  // the band: dark and colored, preferring a color with body over a near-black (a deep purple over a lilac glow)
  const band = (glow: Lch) => {
    const cs = byL.filter((c) => c !== glow && c.c >= 0.04);
    return cs.find((c) => c.l >= NEAR_BLACK && c.l < DARK_BAND) ?? cs.find((c) => c.l < DARK) ?? (byL[0] !== glow && byL[0].l < DARK ? byL[0] : cs[0] ?? byL[0]);
  };
  // a glow is colored, and stands out above the darkest colored color by lightness or by being vivid
  const glowing = (c: Lch) => c.c >= 0.04 && (c.c >= VIVID || !darkestColored || c.l >= darkestColored.l + GLOW_ABOVE);

  const vivid = best(colors)!;
  // a neon that is the lightest by far: it becomes the field when another vivid color can glow above it
  // under a band of its own; else the neon glows
  let neon: Lch | undefined;
  if (vivid === lightest) {
    const glow = best(colors.filter((c) => c !== vivid && c.c >= VIVID));
    const top = glow && band(glow);
    if (glow && top !== vivid) return { top: top!, core: glow, bottom: vivid, composition: COMPOSITION };
    neon = vivid;
  }
  // else the most colorful color that glows, over the lightest of the rest
  const core = neon ?? best(colors.filter((c) => glowing(c) && c !== lightest)) ?? best(colors.filter(glowing)) ?? vivid;
  const top = band(core);
  const bottom = [...byL].reverse().find((c) => c !== core && c !== top) ?? lightest;
  return { top, core, bottom, composition: COMPOSITION };
}

// ---------- as CSS ----------
//
// Two radial gradients over the bottom color. Near its lowest point, the
// lower edge of a large ellipse is a parabola with curvature ry / (2 rx²);
// near its highest point, so is the upper edge. So:
//   - the glow is an ellipse centered above the U's deepest point, its color
//     inside, fading out across the U edge;
//   - the band is the outside of an ellipse centered below its edge's highest
//     point: transparent inside, the top color outside.
// A soft edge becomes stops whose opacity follows Φ, spaced by blur / ry
// (exact at the vertex, where the edge is closest to the axis).

/** a radial-gradient layer in the units of the composition */
export interface RadialLayer {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: Lch;
  /** [t, opacity] along the ellipse radius (t = 1 on the edge) */
  stops: [number, number][];
}

/** standard normal CDF (Abramowitz-Stegun 7.1.26) */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const Z = [-2.4, -1.6, -1, -0.5, 0, 0.5, 1, 1.6, 2.4];
/** Φ, with the outermost stops snapped to fully clear / fully opaque */
const opacity = (z: number) => (z <= Z[0] ? 0 : z >= Z[Z.length - 1] ? 1 : phi(z));

/** the band and glow as radial gradients, top layer first. `bandRy`/`glowRy` set the ellipses' height: the larger, the closer their edge is to a parabola (3 and 4 fit our composition at ΔE ≈ 0.2) */
export function radialLayers(g: Gradient, bandRy?: number, glowRy = 4): RadialLayer[] {
  const k = g.composition;
  const curve = Math.max(k.bandCurve, 0.02);
  const xv = 0.5 - k.bandTilt / (2 * curve);
  // a nearly straight band has its vertex far outside the box: make the ellipse
  // taller, so that the box stays in its parabola-like part (rx ≥ ~2.7 · d)
  const d = Math.max(Math.abs(xv), Math.abs(1 - xv));
  bandRy ??= Math.max(3, 15 * curve * d * d);
  const yv = k.bandY + k.bandTilt * (xv - 0.5) + curve * (xv - 0.5) ** 2;
  const band: RadialLayer = {
    cx: xv, cy: yv + bandRy, rx: Math.sqrt(bandRy / (2 * curve)), ry: bandRy, color: g.top,
    // outside the ellipse (t > 1) is the band; a point at t lies (t - 1) · ry beyond the edge
    stops: Z.map((z) => [1 + (z * k.bandBlur) / bandRy, opacity(z)]),
  };
  const glow: RadialLayer = {
    cx: k.uX, cy: k.uDepth - glowRy, rx: Math.sqrt(glowRy / (2 * k.uCurve)), ry: glowRy, color: g.core,
    stops: Z.map((z) => [1 + (z * k.uBlur) / glowRy, opacity(-z)]),
  };
  return [band, glow];
}

/** CSS for the layers; percentages refer to the box (positions and radii) */
export function layersCss(layers: RadialLayer[], bottom: Lch, aspect = 4 / 3): string {
  const pc = (v: number) => `${(v * 100).toFixed(2)}%`;
  const radial = (l: RadialLayer) => {
    const hex = toHex(l.color);
    const stops = l.stops.map(([t, a]) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")} ${pc(t)}`).join(", ");
    return `radial-gradient(${pc(l.rx)} ${pc(l.ry / aspect)} at ${pc(l.cx)} ${pc(l.cy / aspect)}, ${stops})`;
  };
  return [...layers.map(radial), toHex(bottom)].join(", ");
}

/** The gradient as CSS: two radial gradients over the bottom color. */
export function gradientCss(g: Gradient): string {
  const css = layersCss(radialLayers(g), g.bottom);
  if (!g.fourth) return css;
  const field = toHex(g.bottom);
  return `${css.slice(0, css.lastIndexOf(", "))}, linear-gradient(${FIELD_ANGLE}deg, ${field} ${FIELD_FROM * 100}%, ${toHex(g.fourth)} 100%)`;
}
