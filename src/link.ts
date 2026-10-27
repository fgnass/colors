// A link to a palette: /p/<key>. The key holds what makes the palette (seed,
// locks, settings), not its colors. The app and the link preview (Pages
// Functions) make the palette from it with the model, so a change to the
// model can change the colors of an existing link.
import { composeArt, type Art, type ArtColors } from "./art.ts";
import { sampleCanvases, type Canvases } from "./core/canvas.ts";
import { fromHex, toHex } from "./core/color.ts";
import { familyIndex, generatePalettes, HUE_FAMILIES, type Locks, type Palette } from "./core/palette.ts";
import { createRng } from "./core/random.ts";

export type AllLocks = Locks & Partial<Canvases>;

/** What makes a palette. */
export interface Key {
  seed: number;
  locks: AllLocks;
  /** the mood setting, -1 muted … 0 as in the data … 1 vivid; no longer set in the app, kept for old links */
  mood: number;
  /** hue families the palette contains (the same twice: monochrome), empty for any */
  families: string[];
  /** neon splash: the color closest to a neon made neon */
  neon: boolean;
  colors: ArtColors;
  /** interface tokens made to pass WCAG AA */
  accessible: boolean;
}

/** A palette as shown: what the link preview draws. */
export interface Shared {
  palette: Palette;
  canvas: Canvases;
  art: Art;
}

/** The model's part of a palette. `base` is the palette without the mood, `plain` also without neon. */
export function make({
  seed,
  locks,
  mood,
  families,
  neon,
  colors,
}: Omit<Key, "accessible">): Shared & { base: Palette; plain: Palette } {
  const rng = createRng(seed);
  const { paper, ink, ...colorLocks } = locks;
  // The mood has its own stream, so the setting does not move other colors.
  const moodRng = createRng(seed ^ 0x6d6f6f64);
  const { palette, base, plain } = generatePalettes(rng, colorLocks, { mood, families, neon, moodRng });
  // Formerly the plate variant. Still drawn, so existing seeds keep their canvases.
  rng();
  // Canvases and artwork come after the palette and from the palette without
  // the mood, so moving the mood only changes colors. The fill colors are
  // chosen without neon, so turning it on keeps the composition.
  const canvas = sampleCanvases(rng, base, { paper, ink });
  const art = composeArt(rng, base, colors, plain);
  return { palette, base, plain, canvas, art };
}

const LOCK_KEYS = { m: "main", c: "companion", a: "anchor", p: "paper", i: "ink" } as const;

/**
 * The key in a link: the seed (base 36), then the settings that differ from
 * the defaults, each after a "-": n0 (no neon), c2 / c4 (colors), a1
 * (accessible), f<i> and g<i> (hue families, by index), m<0…200> (mood + 1,
 * in hundredths), l<role><hex> (a locked color: lm, lc, la, lp, li).
 */
export function linkKey(k: Key): string {
  const parts = [k.seed.toString(36)];
  if (!k.neon) parts.push("n0");
  if (k.colors !== 3) parts.push(`c${k.colors}`);
  if (k.accessible) parts.push("a1");
  k.families.forEach((f, i) => parts.push(`${"fg"[i]}${familyIndex(f)}`));
  if (k.mood) parts.push(`m${Math.round(k.mood * 100) + 100}`);
  for (const [letter, role] of Object.entries(LOCK_KEYS)) {
    const c = k.locks[role];
    if (c) parts.push(`l${letter}${toHex(c).slice(1).toLowerCase()}`);
  }
  return parts.join("-");
}

/** The key of a link, or null if it is none. */
export function parseLink(s: string): Key | null {
  const [seed, ...parts] = s.split("-");
  if (!/^[0-9a-z]{1,7}$/.test(seed)) return null;
  const k: Key = {
    seed: parseInt(seed, 36),
    locks: {},
    mood: 0,
    families: [],
    neon: true,
    colors: 3,
    accessible: false,
  };
  for (const part of parts) {
    let m: RegExpMatchArray | null;
    if (part === "n0") k.neon = false;
    else if (part === "a1") k.accessible = true;
    else if ((m = part.match(/^c([234])$/))) k.colors = Number(m[1]) as ArtColors;
    else if ((m = part.match(/^[fg](\d)$/)) && HUE_FAMILIES[Number(m[1])])
      k.families.push(HUE_FAMILIES[Number(m[1])].name);
    else if ((m = part.match(/^m(\d{1,3})$/)) && Number(m[1]) <= 200) k.mood = (Number(m[1]) - 100) / 100;
    else if ((m = part.match(/^l([mcapi])([0-9a-f]{6})$/)))
      k.locks[LOCK_KEYS[m[1] as keyof typeof LOCK_KEYS]] = fromHex("#" + m[2]);
    else return null;
  }
  return k;
}

/** The key from a path like /p/<key>. */
export const keyOfPath = (path: string) => path.match(/^\/p\/([^/]+)\/?$/)?.[1] ?? null;
