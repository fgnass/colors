// A palette entry and its derived views. No browser state is read here.
import { fillRoles, type Art } from "../art.ts";
import { isCanvas, type CanvasKind, type Canvases } from "../core/canvas.ts";
import { snap, type Lch } from "../core/color.ts";
import { gradientFrom, type Gradient } from "../core/gradient.ts";
import { paletteName, uniqueNames } from "../core/names.ts";
import { ROLES, type Lockable, type Palette, type Role } from "../core/palette.ts";
import { scales, themes, type Scales, type Themes } from "../core/tokens.ts";
import { make, type Key } from "../link.ts";

/** Every color of an entry: the palette roles, then the canvases. */
export type ColorRole = Role | CanvasKind;
export const COLOR_ROLES: ColorRole[] = [...ROLES, "paper", "ink"];

/** The colors that can be locked, in the order of the keyboard shortcuts 1 to 5. */
export type LockRole = Lockable | CanvasKind;
export const LOCKABLE: LockRole[] = ["main", "companion", "anchor", "paper", "ink"];

/** The names of the roles in the interface. */
export const ROLE_LABELS: Record<ColorRole, string> = {
  main: "Main",
  companion: "Companion",
  anchor: "Anchor",
  light: "Main · light",
  dark: "Main · dark",
  paper: "Light canvas",
  ink: "Dark canvas",
};

export interface Entry extends Key {
  palette: Palette;
  canvas: Canvases;
  gradient: Gradient;
  art: Art;
  name: string;
  names: Record<ColorRole, string>;
  scales: Scales;
  themes: Themes;
}

export const colorOf = (e: Entry, role: ColorRole): Lch => (isCanvas(role) ? e.canvas[role] : e.palette[role]);

export function createEntry(key: Key): Entry {
  // Links store hex locks and the mood in hundredths. The entry is generated with that same precision,
  // so it is exactly what its link reproduces.
  const locks = Object.fromEntries(Object.entries(key.locks).map(([role, color]) => [role, snap(color)]));
  const normalized = { ...key, locks, mood: Math.round(key.mood * 100) / 100 };
  const { palette, plain, canvas, art } = make(normalized);
  const roles: Role[] = ["main", ...fillRoles(plain, key.colors - 1)];
  const gradient = gradientFrom(palette, roles);
  const colorScales = scales(palette, canvas);
  const namedColors: [ColorRole, Lch][] = ROLES.map((role) => [role, palette[role]]);
  namedColors.push(["paper", canvas.paper], ["ink", canvas.ink]);
  const names = uniqueNames(namedColors);

  return {
    ...normalized,
    palette,
    canvas,
    gradient,
    art,
    names,
    name: paletteName(names.main, names.companion),
    scales: colorScales,
    themes: themes(palette, canvas, colorScales, roles, key.accessible),
  };
}

/** Locks are generation inputs: the free colors are made again, so the link reproduces the entry. */
export function toggleEntryLock(entry: Entry, role: LockRole): Entry {
  const locks = { ...entry.locks };
  if (locks[role]) delete locks[role];
  else locks[role] = colorOf(entry, role);
  return createEntry({ ...entry, locks });
}
