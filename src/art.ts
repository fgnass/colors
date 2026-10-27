// Plate artwork: one tile shape whose pieces are filled with palette colors.
import { contrast, distance, toHex, type Lch } from "./core/color.ts";
import type { Palette, Role } from "./core/palette.ts";
import type { Rng } from "./core/random.ts";
import { SHAPE_SIZE, SHAPES } from "./shapes.ts";

/** The number of colors in the artwork, the plate's main color included. */
export type ArtColors = 2 | 3 | 4;

export interface Art {
  shape: number;
  rotate: 0 | 90 | 180 | 270;
  /** the one-piece shape is split into parts (quadrants or bands) */
  split: boolean;
  /** fill role per part */
  fills: Role[];
}

/** The fillable parts of a shape: its own parts, or the parts it is split into. */
function parts(shape: number, split: boolean) {
  const s = SHAPES[shape];
  return split && s.split ? s.split : s;
}

// The shape fills a right-aligned square below the title (up to three lines), above the footer.
const TOP = 34;
const SIZE = 83;
const FILL_ORDER: Role[] = ["companion", "anchor", "dark", "light"];

/** Two colors tell apart: by lightness contrast, or by color (OKLab distance). */
const apart = (a: Lch, b: Lch, min: number) => contrast(toHex(a), toHex(b)) >= min || distance(a, b) >= 0.15;

/** Fill colors that stand out on the main and differ from each other. */
export function fillRoles(p: Palette, n: number): Role[] {
  // The other palette colors first, the more colorful one first; the main's own tints after them.
  const order = [...FILL_ORDER.slice(0, 2).sort((a, b) => p[b].c - p[a].c), ...FILL_ORDER.slice(2)];
  const picked: Role[] = [];
  for (const r of order) {
    if (picked.length === n) break;
    if (!apart(p[r], p.main, 1.35)) continue;
    if (picked.some((q) => !apart(p[q], p[r], 1.15))) continue;
    picked.push(r);
  }
  // A low-contrast palette: fill up in order, readable or not.
  for (const r of order) if (picked.length < n && !picked.includes(r)) picked.push(r);
  return picked;
}

/**
 * Color the pieces, largest first: each piece takes the least used color
 * (by area) that none of its colored neighbours has.
 */
function colorPieces({ areas, neighbours }: { areas: number[]; neighbours: number[][] }, roles: Role[]): Role[] {
  const order = areas.map((_, i) => i).sort((a, b) => areas[b] - areas[a]);
  const fills: number[] = Array(areas.length).fill(-1);
  const used = roles.map(() => 0);
  for (const i of order) {
    const taken = new Set(neighbours[i].map((j) => fills[j]));
    const free = roles.map((_, k) => k).filter((k) => !taken.has(k));
    const pool = free.length ? free : roles.map((_, k) => k);
    const k = pool.reduce((best, c) => (used[c] < used[best] ? c : best));
    fills[i] = k;
    used[k] += areas[i];
  }
  return fills.map((k) => roles[k]);
}

const splitParts = (i: number) => SHAPES[i].split?.areas.length ?? 0;
const fits = (i: number, n: number) => SHAPES[i].areas.length >= n || (n > 1 && splitParts(i) >= n);

/**
 * `p` picks the shape (stable while the mood moves), `colors` the number of
 * fills, `shown` the fill colors: the palette as shown, so all views agree.
 */
export function composeArt(rng: Rng, p: Palette, colors: ArtColors = 2, shown: Palette = p): Art {
  const n = colors - 1;
  // The shape is drawn from all shapes, so switching the number of colors
  // keeps it. Only a shape without enough parts is replaced.
  let shape = Math.floor(rng() * SHAPES.length);
  const rotate = ([0, 90, 180, 270] as const)[Math.floor(rng() * 4)];
  if (!fits(shape, n)) {
    const eligible = SHAPES.map((_, i) => i).filter((i) => fits(i, n));
    shape = eligible[Math.floor(rng() * eligible.length)];
  }
  // With more than one fill, a shape that can be split uses its split parts.
  const split = n > 1 && splitParts(shape) >= n;
  return { shape, rotate, split, fills: colorPieces(parts(shape, split), fillRoles(shown, n)) };
}

/** The artwork in a SHAPE_SIZE square. */
export function artGroup(art: Art, p: Palette): string {
  const c = SHAPE_SIZE / 2;
  const { pieces, part, split } = SHAPES[art.shape];
  // A nested <svg> clips to its viewport: one per part, so no clipPath ids are needed.
  const paths =
    art.split && split
      ? art.fills
          .map((role, i) => {
            const [x, y, w, h] = split.rects[i];
            const fill = toHex(p[role]);
            const shapes = pieces.map((d) => `<path d="${d}" fill="${fill}"/>`).join("");
            return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${shapes}</svg>`;
          })
          .join("")
      : pieces.map((d, i) => `<path d="${d}" fill="${toHex(p[art.fills[part[i]]])}"/>`).join("");
  return `<g transform="rotate(${art.rotate} ${c} ${c})">${paths}</g>`;
}

export function artSvg(art: Art, p: Palette): string {
  const style = `left:${100 - SIZE}cqw;top:${TOP}cqw;width:${SIZE}cqw;height:${SIZE}cqw`;
  return `<svg class="tile" viewBox="0 0 ${SHAPE_SIZE} ${SHAPE_SIZE}" style="${style}" aria-hidden="true">
    ${artGroup(art, p)}</svg>`;
}
