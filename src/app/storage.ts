// Browser storage is optional; unavailable or malformed values fall back to defaults.
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
  } catch { /* The app remains usable when storage is unavailable or full. */ }
}

export function parseLegacyKey(hash: string): { seed: number; locks: AllLocks; mood: number; families: string[]; neon: boolean; colors?: ArtColors; accessible: boolean } | null {
  const match = hash.match(/^#([0-9a-z]+)(?:~([^;]*))?((?:;[a-z]-?\d+)*)$/i);
  if (!match) return null;
  const options = Object.fromEntries(
    [...(match[3] ?? "").matchAll(/;([a-z])(-?\d+)/gi)].map((part) => [part[1], Number(part[2])]),
  );
  const locks: AllLocks = {};
  for (const part of (match[2] ?? "").split(",").filter(Boolean)) {
    const [letter, value] = part.split(":");
    const role = { m: "main", c: "companion", a: "anchor", p: "paper", i: "ink" }[letter] as Lockable | CanvasKind | undefined;
    if (role && /^[0-9a-f]{6}$/i.test(value)) locks[role] = fromHex("#" + value);
  }
  const colors = [2, 3, 4].includes(options.c) ? (options.c as ArtColors) : undefined;
  const mood = Number.isFinite(options.m) ? Math.max(-1, Math.min(1, options.m / 100)) : 0;
  const families = [options.f, options.g].map((i) => HUE_FAMILIES[i]?.name).filter((f): f is string => !!f);
  return {
    seed: parseInt(match[1], 36),
    locks, mood, families, colors,
    neon: options.n === 1,
    accessible: options.a === 1,
  };
}

/** Palette identity excludes preferences that only change its presentation. */
export const paletteIdentity = (key: Key) => linkKey({ ...key, colors: 3, accessible: false });

/** Read old hash-based shortlists as well as current path keys. */
export function readShortlist(): (Omit<Key, "colors"> & { colors?: ArtColors })[] {
  try {
    const keys: unknown = JSON.parse(readStored("colors.shortlist") ?? "[]");
    if (!Array.isArray(keys)) return [];
    return keys.flatMap((key) => {
      if (typeof key !== "string") return [];
      const parsed = key.startsWith("#") ? parseLegacyKey(key) : parseLink(key);
      return parsed ? [parsed] : [];
    });
  } catch { return []; }
}
