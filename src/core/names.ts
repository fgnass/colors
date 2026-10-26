// Color names from meodai/color-names (filtered, see scripts/names.mjs):
// each color gets the name of the nearest named color in OKLab.
import { fromHex, type Lch } from "./color.ts";

let names: string[] = [];
let lab = new Float32Array(0);

const toLab = (c: Lch): [number, number, number] => [
  c.l, c.c * Math.cos((c.h * Math.PI) / 180), c.c * Math.sin((c.h * Math.PI) / 180),
];

/** Load the "name<TAB>rrggbb" list. */
export async function loadNames(url: string): Promise<void> {
  parseNames(await (await fetch(url)).text());
}

export function parseNames(text: string): void {
  const rows = text.split("\n").filter(Boolean).map((l) => l.split("\t"));
  names = rows.map((r) => r[0]);
  lab = new Float32Array(rows.length * 3);
  rows.forEach(([, hex], i) => lab.set(toLab(fromHex(hex)), i * 3));
}

/** Indices of the k nearest named colors. */
function nearest(c: Lch, k: number): number[] {
  const [L, A, B] = toLab(c);
  const best: [number, number][] = [];
  for (let i = 0; i < names.length; i++) {
    const d = (lab[i * 3] - L) ** 2 + (lab[i * 3 + 1] - A) ** 2 + (lab[i * 3 + 2] - B) ** 2;
    if (best.length < k || d < best[best.length - 1][0]) {
      best.push([d, i]);
      best.sort((x, y) => x[0] - y[0]);
      if (best.length > k) best.pop();
    }
  }
  return best.map(([, i]) => i);
}

export function colorName(c: Lch): string {
  return names[nearest(c, 1)[0]] ?? "";
}

/** Names for all colors of a palette, in order of importance, without repeats. */
export function uniqueNames<K extends string>(colors: [K, Lch][]): Record<K, string> {
  const used = new Set<string>();
  const out = {} as Record<K, string>;
  for (const [key, c] of colors) {
    const name = nearest(c, 8).map((i) => names[i]).find((n) => !used.has(n)) ?? colorName(c);
    used.add(name);
    out[key] = name;
  }
  return out;
}

export const paletteName = (main: string, companion: string) => `${main} & ${companion}`;
