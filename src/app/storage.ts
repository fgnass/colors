// Browser storage is optional: unavailable or malformed values fall back to defaults.
import { fromHex } from "../core/color.ts";
import type { CanvasKind } from "../core/canvas.ts";
import type { ArtColors } from "../art.ts";
import { HUE_FAMILIES, type Lockable } from "../core/palette.ts";
import { parseLink, linkKey, type AllLocks, type Key } from "../link.ts";

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The app stays usable when storage is unavailable or full.
  }
}

/** An old link key, from before the keys moved to the path: #<seed>~<locks>;<option><value>… */
export function parseLegacyKey(hash: string): (Omit<Key, "colors"> & { colors?: ArtColors }) | null {
  const match = hash.match(/^#([0-9a-z]+)(?:~([^;]*))?((?:;[a-z]-?\d+)*)$/i);
  if (!match) return null;
  const options = Object.fromEntries(
    [...(match[3] ?? "").matchAll(/;([a-z])(-?\d+)/gi)].map((part) => [part[1], Number(part[2])]),
  );
  const locks: AllLocks = {};
  for (const part of (match[2] ?? "").split(",").filter(Boolean)) {
    const [letter, value] = part.split(":");
    const role = { m: "main", c: "companion", a: "anchor", p: "paper", i: "ink" }[letter] as
      Lockable | CanvasKind | undefined;
    if (role && /^[0-9a-f]{6}$/i.test(value)) locks[role] = fromHex("#" + value);
  }
  const colors = [2, 3, 4].includes(options.c) ? (options.c as ArtColors) : undefined;
  const mood = Number.isFinite(options.m) ? Math.max(-1, Math.min(1, options.m / 100)) : 0;
  const families = [options.f, options.g].map((i) => HUE_FAMILIES[i]?.name).filter((f): f is string => !!f);
  return {
    seed: parseInt(match[1], 36),
    locks,
    mood,
    families,
    colors,
    neon: options.n === 1,
    accessible: options.a === 1,
  };
}

/** A palette's identity, without the preferences that only change its presentation. */
export const paletteIdentity = (key: Key) => linkKey({ ...key, colors: 3, accessible: false });

export const SHORTLIST_KEY = "colors.shortlist";

/** The shortlist's keys: current path keys, and old hash-based ones. */
export function readShortlist(): (Omit<Key, "colors"> & { colors?: ArtColors })[] {
  try {
    const keys: unknown = JSON.parse(readStored(SHORTLIST_KEY) ?? "[]");
    if (!Array.isArray(keys)) return [];
    return keys.flatMap((key) => {
      if (typeof key !== "string") return [];
      const parsed = key.startsWith("#") ? parseLegacyKey(key) : parseLink(key);
      return parsed ? [parsed] : [];
    });
  } catch {
    return [];
  }
}
