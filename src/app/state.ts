// The app's state: the feed of palettes, the shortlist, the view and the settings.
import type { ArtColors } from "../art.ts";
import type { AllLocks, Key } from "../link.ts";
import type { SvgArt } from "../svg.ts";
import { createEntry, type ColorRole, type Entry } from "./entry.ts";
import { paletteIdentity } from "./storage.ts";

/** What a screen, and a grid tile, shows. Details is the phone's version of the sidebar. */
export type Mode = "shapes" | "gradient" | "light" | "dark" | "svg" | "details";
export const MODES: [Mode, string][] = [
  ["shapes", "Shapes"],
  ["gradient", "Gradient"],
  ["light", "UI light"],
  ["dark", "UI dark"],
  ["svg", "Your SVG"],
  ["details", "Details"],
];
export const isMode = (s: string | null): s is Mode => MODES.some(([m]) => m === s);

export type Tab = "scales" | "css" | "tailwind" | "json";

export const state = {
  /** the feed: one list of palettes, which the grid shows a page at a time */
  history: [] as Entry[],
  /** the place of the current palette in the feed */
  index: -1,
  /** the palette waiting below the current one, made with the current settings and locks */
  next: null as Entry | null,
  view: "feed" as "feed" | "grid",
  gridFrom: "fresh" as "fresh" | "shortlist",
  mode: "shapes" as Mode,
  tab: "scales" as Tab,
  /** the settings new palettes are made with; in the feed, those of the palette shown */
  families: [] as string[],
  neon: true,
  colors: 3 as ArtColors,
  accessible: false,
  shortlist: [] as Entry[],
  /** a pasted SVG, shown in the palette's colors */
  svg: null as SvgArt | null,
  /** the sample logo is shown until an SVG of your own is loaded */
  svgSample: false,
  /** the palette color chosen per SVG color (by its index), instead of the automatic one */
  svgRoles: {} as Record<number, ColorRole>,
  settings: false,
  /**
   * While the feed walks the shortlist: the place in it of the palette that
   * was opened from the shortlist. Null while the feed shows fresh palettes.
   */
  shortlistCursor: null as number | null,
};

/** The settings that go into a palette, besides the display preferences the state supplies. */
export type EntrySettings = Pick<Key, "families" | "neon"> & Partial<Pick<Key, "mood">>;

export function makeEntry(seed: number, locks: AllLocks, settings: EntrySettings): Entry {
  return createEntry({
    seed,
    locks,
    mood: settings.mood ?? 0,
    families: settings.families,
    neon: settings.neon,
    colors: state.colors,
    accessible: state.accessible,
  });
}

/** The palette at i in the feed. It is made again if the display preferences changed since it was made. */
export function entryAt(i: number): Entry {
  const e = state.history[i];
  const stale = e.colors !== state.colors || e.accessible !== state.accessible;
  if (stale) state.history[i] = makeEntry(e.seed, e.locks, e);
  return state.history[i];
}

export const current = () => entryAt(state.index);

/** The identity of a palette: its link key without the display preferences. */
export const identityOf = paletteIdentity;

export const isSame = (a: Entry, b: Entry) => identityOf(a) === identityOf(b);
