// The colors of a palette in the path of a link: /p/<token>#<key>.
// The key in the hash remakes the palette in the app; the token holds the
// colors and the artwork as shown, so a link preview (og:image) can be drawn
// without the model, and a link still shows its colors when the model changes.
import type { Art } from "./art.ts";
import type { Canvases } from "./core/canvas.ts";
import { fromHex, toHex } from "./core/color.ts";
import { ROLES, type Palette } from "./core/palette.ts";
import { SHAPES } from "./shapes.ts";

export interface Shared {
  palette: Palette;
  canvas: Canvases;
  art: Art;
}

/** 7 colors (the roles, then paper and ink), then the artwork: a<shape>r<quarter turns><s: split, p: plain><fill role indices> */
export function shareToken({ palette, canvas, art }: Shared): string {
  const colors = [...ROLES.map((r) => palette[r]), canvas.paper, canvas.ink].map((c) => toHex(c).slice(1).toLowerCase());
  const fills = art.fills.map((r) => ROLES.indexOf(r)).join("");
  return `${colors.join("-")}-a${art.shape}r${art.rotate / 90}${art.split ? "s" : "p"}${fills}`;
}

export function parseShare(token: string): Shared | null {
  const m = token.match(/^((?:[0-9a-f]{6}-){7})a(\d+)r([0-3])([sp])([0-4]+)$/i);
  if (!m || !SHAPES[Number(m[2])]) return null;
  const [main, companion, anchor, light, dark, paper, ink] = m[1].split("-").slice(0, 7).map((h) => fromHex("#" + h));
  return {
    palette: { main, companion, anchor, light, dark },
    canvas: { paper, ink },
    art: {
      shape: Number(m[2]),
      rotate: (Number(m[3]) * 90) as Art["rotate"],
      split: m[4] === "s",
      fills: [...m[5]].map((i) => ROLES[Number(i)]),
    },
  };
}

/** the token from a path like /p/<token> */
export const tokenOf = (path: string) => path.match(/^\/p\/([^/]+)\/?$/)?.[1] ?? null;
