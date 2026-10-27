// A palette entry and its derived views. No browser state is read here.
import { fillRoles, type Art } from "../art.ts";
import type { CanvasKind, Canvases } from "../core/canvas.ts";
import { snap, type Lch } from "../core/color.ts";
import { gradientFrom, type Gradient } from "../core/gradient.ts";
import { paletteName, uniqueNames } from "../core/names.ts";
import { ROLES, type Lockable, type Palette, type Role } from "../core/palette.ts";
import { scales, themes, type Scales, type Theme } from "../core/tokens.ts";
import { make, type Key } from "../link.ts";

export const LOCKABLE: (Lockable | CanvasKind)[] = ["main", "companion", "anchor", "paper", "ink"];
export const ROLE_ORDER: Role[] = [...ROLES];

export interface Entry extends Key {
  palette: Palette;
  canvas: Canvases;
  gradient: Gradient;
  art: Art;
  name: string;
  names: Record<Role | CanvasKind, string>;
  scales: Scales;
  themes: { light: Theme; dark: Theme };
}

export function createEntry(key: Key): Entry {
  // Links store hex locks and mood in hundredths. Generate with that same precision.
  const locks = Object.fromEntries(Object.entries(key.locks).map(([role, color]) => [role, snap(color)]));
  const normalized = { ...key, locks, mood: Math.round(key.mood * 100) / 100 };
  const { palette, plain, canvas, art } = make(normalized);
  const roles: Role[] = ["main", ...fillRoles(plain, key.colors - 1)];
  const gradient = gradientFrom(palette, roles);
  const colorScales = scales(palette, canvas);
  const namedColors: [Role | CanvasKind, Lch][] = ROLE_ORDER.map((role) => [role, palette[role]]);
  namedColors.push(["paper", canvas.paper], ["ink", canvas.ink]);
  const names = uniqueNames(namedColors);

  return {
    ...normalized,
    palette, canvas, gradient, art, names,
    name: paletteName(names.main, names.companion),
    scales: colorScales,
    themes: themes(palette, canvas, colorScales, roles, key.accessible),
  };
}

/** Locks are generation inputs: rebuild free colors so the URL reproduces the entry. */
export function toggleEntryLock(entry: Entry, role: Lockable | CanvasKind): Entry {
  const locks = { ...entry.locks };
  if (locks[role]) delete locks[role];
  else locks[role] = role === "paper" || role === "ink" ? entry.canvas[role] : entry.palette[role];
  return createEntry({ ...entry, locks });
}
