// Semantic UI tokens for light and dark mode, chosen by contrast.
import { tintAt, type Canvases } from "./canvas.ts";
import { apca, contrast, fromHex, toGamut, toHex, type Lch } from "./color.ts";
import type { Palette, Role } from "./palette.ts";
import { nearestStep, neutralRamp, ramp, STEPS, type Ramp, type Step } from "./ramp.ts";

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
  /** the loud color's own tint: a second data series, the toggle knob */
  accent: string;
  onAccent: string;
  /** with 4 colors, a third data series: the third core color */
  accent2: string;
  /** the next color, darkened in its own hue until white text reads: tags, avatar */
  second: string;
  onSecond: string;
  highlight: string;
  onHighlight: string;
  /** the secondary button: neutral */
  tertiary: string;
  onTertiary: string;
}

export function scales(p: Palette, cv: Canvases): Scales {
  // the darkest clearly colored palette color, if it is dark: the scales lean into it
  const dark = [p.main, p.companion, p.anchor].filter((c) => c.c >= 0.04 && c.l < 0.5).sort((a, b) => a.l - b.l)[0];
  return { main: ramp(p.main, dark), companion: ramp(p.companion, dark), anchor: ramp(p.anchor, dark), neutral: neutralRamp(cv) };
}

/** the readable one of two text colors on a background (APCA) */
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

const CORE = ["main", "companion", "anchor"] as const;

const lch = (l: number, c: number, h: number) => toHex(toGamut({ l, c, h }));

/** text on the loud color: a dark shade in the hue of the second color, or light text, whichever reads better */
function onLoud(fill: string, second: Lch, paper: string): string {
  const dark = lch(0.3, Math.min(second.c, 0.05), second.h);
  // by APCA: on a mid-light vivid color (a red) WCAG 2 favors dark text, though light text reads far better
  return onColor(fill, paper, dark);
}

/** the loud color's own tint, for a second series: its palette tint if it is the main, else two steps of its scale away */
function tintOf(p: Palette, sc: Scales, role: (typeof CORE)[number]): string {
  const c = p[role];
  if (role === "main") return toHex(c.l > 0.6 ? p.dark : p.light);
  const i = STEPS.indexOf(nearestStep(c));
  return toHex(sc[role][STEPS[Math.max(0, Math.min(STEPS.length - 1, i + (c.l > 0.6 ? 2 : -2)))]]);
}

/** the light background is at most this light, so the near-white cards stand out from it */
const LIGHT_BG_MAX = 0.955;
/** a palette color at least this colorful gives the dark background its hue */
const DARK_BG_MIN_C = 0.04;
const DARK_BG_L = 0.2;
const DARK_BG_MAX_C = 0.08;

/**
 * Light background: a light, almost neutral palette color if there is one
 * (a loud light color shows on grey, not on white), with cards near white in
 * its hue; else the neutral scale's step 100 (tinted by the palette) with
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
 * `roles`: the palette colors in use. The neutral background counts as one, so the interface uses one
 * fewer: 2, the loud color and neutrals; 3, plus a data series; 4, plus a second series.
 * Tags, avatar and the secondary button stay neutral.
 */
export function themes(p: Palette, cv: Canvases, sc: Scales, roles: Role[] = [...CORE], accessible = false): { light: Theme; dark: Theme } {
  // the palette colors in use, as on the plate; tints of the main count as the main
  const set = [...new Set(roles.map((r) => (r === "light" || r === "dark" ? "main" : r)))] as (typeof CORE)[number][];
  const count = roles.length;
  // all greys of the interface come from the neutral scale: text, muted text, borders, text on colors
  const n = (s: Step) => toHex(sc.neutral[s]);
  const paper = n(50);
  const ink = n(950);
  // the visibly most colorful palette color is the loud one; the next one is the second color
  const byC = [...set].sort((a, b) => p[b].c - p[a].c);
  const [vivid, next = vivid] = byC;
  // the neutral background counts as one of the colors: the interface uses one palette color fewer,
  // the loud one for actions and the rest as data series (2: loud + neutral, 3: one series, 4: two)
  // the first series needs color (else the series is neutral); a second one may be grey, next to a colored first
  const candidates = byC.slice(1, Math.max(1, count - 1));
  const series = candidates[0] && p[candidates[0]].c >= 0.04 ? candidates : [];
  const loud = p[vivid];
  const primary = toHex(loud);
  const onPrimary = onLoud(primary, p[next], paper);
  const accent = series[0] ? toHex(p[series[0]]) : tintOf(p, sc, vivid);
  // the active nav pill: the palette's own light tint when the loud color is the main (as in the gradient), else a light step of its scale
  const primarySoft = toHex(vivid === "main" ? p.light : sc[vivid][100]);
  const shared = { primary, onPrimary, accent, onAccent: onColor(accent, paper, ink), primarySoft, onPrimarySoft: onColor(primarySoft, paper, ink) };

  // dark: a deep version of the darkest colored palette color (a purple gives a deep purple, a teal grey a deep teal);
  // without one, the darkest neutral; cards a little lighter in its hue
  // nearly as dark (within 0.1) counts as a tie, and the main wins it
  const deep = [vivid, ...series].map((r) => p[r]).filter((c) => c.c >= DARK_BG_MIN_C)
    .sort((a, b) => a.l - (a === p.main ? 0.1 : 0) - (b.l - (b === p.main ? 0.1 : 0)))[0];
  const darkBg = deep ? toGamut({ l: DARK_BG_L, c: Math.min(DARK_BG_MAX_C, deep.c * 0.8), h: deep.h }) : sc.neutral[950];
  const { bg: lightBase, surface: lightCard } = lightBg(p, sc);
  const lightSurface = toHex(lightCard);
  const lightHighlight = usable(p.anchor, sc.anchor, lightSurface, 3, true);
  const series3 = series[1] ? toHex(p[series[1]]) : undefined;
  // without a series color, the data series is neutral
  const neutralSeries = (c: string, on: string) => (series[0] ? {} : { accent: c, onAccent: on, accent2: c });
  const tertiary = (bg: string, text: string) => ({ tertiary: bg, onTertiary: text });
  const light: Theme = {
    bg: toHex(lightBase), surface: lightSurface, text: ink, muted: n(700), border: n(200),
    ...shared, second: toHex(lightBase), onSecond: ink, accent2: series3 ?? shared.accent,
    ...neutralSeries(toHex(sc.neutral[300]), ink),
    highlight: lightHighlight, onHighlight: onColor(lightHighlight, paper, ink),
    ...tertiary(toHex(lightBase), ink),
  };

  const darkSurface = toHex(toGamut({ ...darkBg, l: darkBg.l + 0.06 }));
  const darkHighlight = usable(p.anchor, sc.anchor, darkSurface, 3, false);
  const dark: Theme = {
    bg: toHex(darkBg), surface: darkSurface, text: paper, muted: n(400), border: toHex(toGamut({ ...darkBg, l: darkBg.l + 0.13 })),
    ...shared,
    // on dark, a second color darkened for white text can sink into the cards: then it keeps its own lightness, with dark text
    second: toHex(darkBg), onSecond: paper, accent2: series3 ?? shared.accent,
    ...neutralSeries(toHex(toGamut({ ...darkBg, c: darkBg.c * 0.5, l: darkBg.l + 0.25 })), paper),
    highlight: darkHighlight, onHighlight: onColor(darkHighlight, paper, ink),
    ...tertiary(toHex(darkBg), paper),
  };
  if (!accessible) return { light, dark };
  const scale = sc[vivid];
  return { light: passAA(light, scale, loud, [paper, ink], sc.neutral, [800, 900, 950]), dark: passAA(dark, scale, loud, [paper, ink], sc.neutral, [300, 200, 100, 50]) };
}

/** the better of the text colors on a background by WCAG 2 */
const bestText = (bg: string, texts: string[]) => texts.reduce((a, b) => (contrast(b, bg) > contrast(a, bg) ? b : a));

/** the color moved in lightness, in small steps, until the text reaches 4.5:1 on it */
function readableUnder(bg: string, text: string): string {
  const c = fromHex(bg);
  const dir = fromHex(text).l > c.l ? -1 : 1;
  for (let l = c.l; l >= 0 && l <= 1; l += dir * 0.01) {
    const hex = toHex(toGamut({ ...c, l }));
    if (contrast(text, hex) >= 4.5) return hex;
  }
  return bg;
}

/**
 * The theme made to pass WCAG AA: the loud color moves along its own scale,
 * from its own step, as far as needed for 3:1 against background and cards
 * and 4.5:1 for text on it; text on colors is the more readable of paper and
 * ink where it doesn't reach 4.5:1; muted text moves toward the text color.
 */
function passAA(t: Theme, scale: Ramp, loud: Lch, texts: string[], neutral: Ramp, mutedSteps: Step[]): Theme {
  const out = { ...t };
  const fits = (c: string) => contrast(c, t.bg) >= 3 && contrast(c, t.surface) >= 3;
  if (!fits(t.primary) || contrast(t.onPrimary, t.primary) < 4.5) {
    const own = [...STEPS].sort((a, b) => Math.abs(scale[a].l - loud.l) - Math.abs(scale[b].l - loud.l));
    const step = own.find((s) => { const c = toHex(scale[s]); return fits(c) && contrast(bestText(c, texts), c) >= 4.5; });
    if (step) out.primary = toHex(scale[step]);
  }
  const pairs = [["primary", "onPrimary"], ["primarySoft", "onPrimarySoft"], ["accent", "onAccent"], ["second", "onSecond"], ["highlight", "onHighlight"], ["tertiary", "onTertiary"]] as const;
  for (const [bg, on] of pairs) {
    if (contrast(out[on], out[bg]) >= 4.5) continue;
    out[on] = bestText(out[bg], [out[on], ...texts]);
    // a mid tone that no text reads on: a little darker under light text, lighter under dark text
    if (contrast(out[on], out[bg]) < 4.5) out[bg] = readableUnder(out[bg], out[on]);
  }
  const reads = (c: string) => contrast(c, t.bg) >= 4.5 && contrast(c, t.surface) >= 4.5;
  if (!reads(t.muted)) out.muted = mutedSteps.map((s) => toHex(neutral[s])).find(reads) ?? t.text;
  return out;
}

/** WCAG AA for the interface, light and dark, as a share of the requirement (1 = passes): text 4.5:1, the loud color against background and cards 3:1 */
export function accessibility(t: { light: Theme; dark: Theme }): number {
  return Math.min(...[t.light, t.dark].flatMap((m) => [
    contrast(m.primary, m.bg) / 3,
    contrast(m.primary, m.surface) / 3,
    ...([["text", "bg"], ["text", "surface"], ["muted", "bg"], ["muted", "surface"], ["onPrimary", "primary"], ["onPrimarySoft", "primarySoft"],
      ["onAccent", "accent"], ["onSecond", "second"], ["onHighlight", "highlight"], ["onTertiary", "tertiary"]] as const)
      .map(([a, b]) => contrast(m[a], m[b]) / 4.5),
  ]));
}

