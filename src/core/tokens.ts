// Semantic interface tokens for light and dark mode, chosen by contrast.
import { tintAt, type Canvases } from "./canvas.ts";
import { apca, CLEARLY_COLORED, contrast, fromHex, mostContrasting, toGamut, toHex, type Lch } from "./color.ts";
import { CORE, type Lockable, type Palette, type Role } from "./palette.ts";
import { neutralRamp, ramp, STEPS, type Ramp, type Step } from "./ramp.ts";

export interface Scales {
  main: Ramp;
  companion: Ramp;
  anchor: Ramp;
  neutral: Ramp;
}

export interface Theme {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  /** the loud color, always the palette's own: main action, logo, badge, current value, toggle track */
  primary: string;
  onPrimary: string;
  /** the active nav pill: a light step of the loud color's scale, the same in both modes */
  primarySoft: string;
  onPrimarySoft: string;
  /** the first data series and the toggle knob: the next palette color, or a neutral */
  accent: string;
  onAccent: string;
  /** with 4 colors a second data series, the third core color; else the same as accent */
  accent2: string;
  /** tags and the avatar: the background, so they stay neutral */
  second: string;
  onSecond: string;
  highlight: string;
  onHighlight: string;
  /** the secondary button: the background */
  tertiary: string;
  onTertiary: string;
}

export interface Themes {
  light: Theme;
  dark: Theme;
}

export function scales(p: Palette, cv: Canvases): Scales {
  // The scales lean into the darkest clearly colored palette color, if it is dark.
  const dark = [p.main, p.companion, p.anchor]
    .filter((c) => c.c >= CLEARLY_COLORED && c.l < 0.5)
    .sort((a, b) => a.l - b.l)[0];
  return {
    main: ramp(p.main, dark),
    companion: ramp(p.companion, dark),
    anchor: ramp(p.anchor, dark),
    neutral: neutralRamp(cv),
  };
}

/** The more readable of two text colors on a background, by APCA. */
function onColor(bg: string, light: string, dark: string): string {
  return Math.abs(apca(light, bg)) >= Math.abs(apca(dark, bg)) ? light : dark;
}

/**
 * The color itself if it reaches `min` contrast against `against`,
 * otherwise the closest step of its scale that does.
 */
function usable(color: Lch, scale: Ramp, against: string, min: number, darker: boolean): string {
  const hex = toHex(color);
  if (contrast(hex, against) >= min) return hex;
  const order = darker ? STEPS : [...STEPS].reverse();
  const candidates = order.filter((s) => (darker ? scale[s].l < color.l : scale[s].l > color.l));
  const hit = candidates.find((s: Step) => contrast(toHex(scale[s]), against) >= min);
  return toHex(scale[hit ?? (darker ? 950 : 50)]);
}

const lch = (l: number, c: number, h: number) => toHex(toGamut({ l, c, h }));

/**
 * Text on the loud color: a dark shade in the hue of the second color, or
 * light text, whichever reads better by APCA. WCAG 2 would favor dark text on
 * a mid-light vivid color (a red), though light text reads far better there.
 */
function onLoud(fill: string, second: Lch, paper: string): string {
  const dark = lch(0.3, Math.min(second.c, 0.05), second.h);
  return onColor(fill, paper, dark);
}

/** The light background is at most this light, so the near-white cards stand out from it. */
const LIGHT_BG_MAX = 0.955;
const DARK_BG_L = 0.2;
const DARK_BG_MAX_C = 0.08;

/**
 * Light background: a light, almost neutral palette color if there is one
 * (a loud light color shows on grey, not on white), with cards near white in
 * its hue; else the neutral scale's step 100, tinted by the palette, with
 * white cards.
 */
function lightBg(p: Palette, sc: Scales): { bg: Lch; surface: Lch } {
  const grey = [p.main, p.anchor, p.companion].find((c) => c.c < 0.03 && c.l >= 0.84 && c.l <= 0.98);
  if (grey) {
    const bg = tintAt(Math.min(grey.l, LIGHT_BG_MAX), grey);
    return { bg, surface: tintAt(0.99, bg) };
  }
  return { bg: sc.neutral[100], surface: { l: 1, c: 0, h: 0 } };
}

/**
 * Dark background: a deep version of the darkest colored palette color among
 * the loud one and the series (a purple gives a deep purple, a teal grey a
 * deep teal). Nearly as dark (within 0.1) counts as a tie, and the main wins
 * it. Without a colored one, the darkest neutral.
 */
function darkBg(p: Palette, sc: Scales, colored: Lockable[]): Lch {
  const bonus = (c: Lch) => (c === p.main ? 0.1 : 0);
  const deep = colored
    .map((r) => p[r])
    .filter((c) => c.c >= CLEARLY_COLORED)
    .sort((a, b) => a.l - bonus(a) - (b.l - bonus(b)))[0];
  return deep ? toGamut({ l: DARK_BG_L, c: Math.min(DARK_BG_MAX_C, deep.c * 0.8), h: deep.h }) : sc.neutral[950];
}

/**
 * Both themes. `roles` are the palette colors in use. The neutral background
 * counts as one of them, so the interface uses one fewer: with 2, the loud
 * color on neutrals; with 3, plus a data series; with 4, plus a second series.
 * Tags, avatar and the secondary button stay neutral.
 */
export function themes(p: Palette, cv: Canvases, sc: Scales, roles: Role[] = [...CORE], accessible = false): Themes {
  // Tints of the main count as the main.
  const inUse = [...new Set(roles.map((r) => (r === "light" || r === "dark" ? "main" : r)))] as Lockable[];
  // All greys of the interface come from the neutral scale: text, muted text, borders, text on colors.
  const n = (s: Step) => toHex(sc.neutral[s]);
  const paper = n(50);
  const ink = n(950);
  // The visibly most colorful palette color is the loud one, the next one is the second color.
  const byChroma = [...inUse].sort((a, b) => p[b].c - p[a].c);
  const [vivid, next = vivid] = byChroma;
  // The data series need color: without a colored first series, the series are neutral.
  const candidates = byChroma.slice(1, Math.max(1, roles.length - 1));
  const series = candidates[0] && p[candidates[0]].c >= CLEARLY_COLORED ? candidates : [];
  const loud = p[vivid];
  const primary = toHex(loud);
  // The active nav pill: the palette's own light tint when the loud color is the main, else a light step of its scale.
  const primarySoft = toHex(vivid === "main" ? p.light : sc[vivid][100]);
  const onPrimary = onLoud(primary, p[next], paper);
  const onPrimarySoft = onColor(primarySoft, paper, ink);
  const seriesTokens = (neutral: string, onNeutral: string) => {
    if (!series[0]) return { accent: neutral, onAccent: onNeutral, accent2: neutral };
    const accent = toHex(p[series[0]]);
    return { accent, onAccent: onColor(accent, paper, ink), accent2: series[1] ? toHex(p[series[1]]) : accent };
  };
  const theme = (
    bg: string,
    surface: string,
    text: string,
    muted: string,
    border: string,
    neutralSeries: string,
    highlight: string,
  ): Theme => {
    const { accent, onAccent, accent2 } = seriesTokens(neutralSeries, text);
    return {
      bg,
      surface,
      text,
      muted,
      border,
      primary,
      onPrimary,
      accent,
      onAccent,
      primarySoft,
      onPrimarySoft,
      second: bg,
      onSecond: text,
      accent2,
      highlight,
      onHighlight: onColor(highlight, paper, ink),
      tertiary: bg,
      onTertiary: text,
    };
  };

  const lightBase = lightBg(p, sc);
  const lightSurface = toHex(lightBase.surface);
  const light = theme(
    toHex(lightBase.bg),
    lightSurface,
    ink,
    n(700),
    n(200),
    toHex(sc.neutral[300]),
    usable(p.anchor, sc.anchor, lightSurface, 3, true),
  );

  const darkBase = darkBg(p, sc, [vivid, ...series]);
  const darkSurface = toHex(toGamut({ ...darkBase, l: darkBase.l + 0.06 }));
  const dark = theme(
    toHex(darkBase),
    darkSurface,
    paper,
    n(400),
    toHex(toGamut({ ...darkBase, l: darkBase.l + 0.13 })),
    toHex(toGamut({ ...darkBase, c: darkBase.c * 0.5, l: darkBase.l + 0.25 })),
    usable(p.anchor, sc.anchor, darkSurface, 3, false),
  );
  if (!accessible) return { light, dark };
  const scale = sc[vivid];
  return {
    light: passAA(light, scale, loud, [paper, ink], sc.neutral, [800, 900, 950]),
    dark: passAA(dark, scale, loud, [paper, ink], sc.neutral, [300, 200, 100, 50]),
  };
}

/** The color moved in lightness, in small steps, until the text reaches 4.5:1 on it. */
function readableUnder(bg: string, text: string): string {
  const c = fromHex(bg);
  const dir = fromHex(text).l > c.l ? -1 : 1;
  for (let l = c.l; l >= 0 && l <= 1; l += dir * 0.01) {
    const hex = toHex(toGamut({ ...c, l }));
    if (contrast(text, hex) >= 4.5) return hex;
  }
  return bg;
}

const TEXT_PAIRS = [
  ["primary", "onPrimary"],
  ["primarySoft", "onPrimarySoft"],
  ["accent", "onAccent"],
  ["second", "onSecond"],
  ["highlight", "onHighlight"],
  ["tertiary", "onTertiary"],
] as const;

/**
 * The theme made to pass WCAG AA. The loud color moves along its own scale,
 * from its own step, as far as needed for 3:1 against background and cards
 * and 4.5:1 for text on it. Text on colors becomes the more readable of paper
 * and ink where it does not reach 4.5:1. Muted text moves toward the text color.
 */
function passAA(t: Theme, scale: Ramp, loud: Lch, texts: string[], neutral: Ramp, mutedSteps: Step[]): Theme {
  const out = { ...t };
  const fits = (c: string) => contrast(c, t.bg) >= 3 && contrast(c, t.surface) >= 3;
  if (!fits(t.primary) || contrast(t.onPrimary, t.primary) < 4.5) {
    const own = [...STEPS].sort((a, b) => Math.abs(scale[a].l - loud.l) - Math.abs(scale[b].l - loud.l));
    const step = own.find((s) => {
      const c = toHex(scale[s]);
      return fits(c) && contrast(mostContrasting(c, texts), c) >= 4.5;
    });
    if (step) out.primary = toHex(scale[step]);
  }
  for (const [bg, on] of TEXT_PAIRS) {
    if (contrast(out[on], out[bg]) >= 4.5) continue;
    out[on] = mostContrasting(out[bg], [out[on], ...texts]);
    // A mid tone that no text reads on: a little darker under light text, lighter under dark text.
    if (contrast(out[on], out[bg]) < 4.5) out[bg] = readableUnder(out[bg], out[on]);
  }
  const reads = (c: string) => contrast(c, t.bg) >= 4.5 && contrast(c, t.surface) >= 4.5;
  if (!reads(t.muted)) out.muted = mutedSteps.map((s) => toHex(neutral[s])).find(reads) ?? t.text;
  return out;
}

/**
 * WCAG AA for the interface, light and dark, as a share of the requirement
 * (1 = passes): text 4.5:1, the loud color against background and cards 3:1.
 */
export function accessibility(t: Themes): number {
  const textOn = [["text", "bg"], ["text", "surface"], ["muted", "bg"], ["muted", "surface"], ...TEXT_PAIRS] as const;
  return Math.min(
    ...[t.light, t.dark].flatMap((m) => [
      contrast(m.primary, m.bg) / 3,
      contrast(m.primary, m.surface) / 3,
      ...textOn.map(([a, b]) => contrast(m[a], m[b]) / 4.5),
    ]),
  );
}
