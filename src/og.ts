// The link preview of a shared palette (og:image, 1200 × 630): the plate as
// in the app, landscape. Drawn as SVG and turned into a PNG on the server.
import { artGroup } from "./art.ts";
import { contrast, toHex, type Lch } from "./core/color.ts";
import { paletteName, uniqueNames } from "./core/names.ts";
import { ROLES } from "./core/palette.ts";
import type { Shared } from "./share.ts";
import { SHAPE_SIZE } from "./shapes.ts";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const PAD = 64;
const ART = 440;
const ART_X = OG_WIDTH - PAD - ART;
/** the title's room: from the left edge to a gap before the artwork */
export const TITLE_WIDTH = ART_X - PAD - 40;
const TITLE_MAX = 124;

const hex = (c: Lch) => toHex(c);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** names as in the app: the roles, then paper and ink, without repeats (needs the names loaded) */
export function sharedNames({ palette, canvas }: Shared) {
  const names = uniqueNames([...ROLES.map((r) => [r, palette[r]] as [string, Lch]), ["paper", canvas.paper], ["ink", canvas.ink]]);
  return { names, name: paletteName(names.main, names.companion) };
}

/** type color on the main, as on the plate: the anchor if it reads, else the most readable color */
function ink({ palette: p, canvas }: Shared): string {
  const on = (c: Lch) => contrast(hex(c), hex(p.main));
  if (on(p.anchor) >= 4.5) return hex(p.anchor);
  const best = (cs: Lch[]) => cs.reduce((a, b) => (on(b) > on(a) ? b : a));
  const pal = best([p.anchor, p.light, p.dark, p.companion]);
  return hex(on(pal) >= 4.5 ? pal : best([canvas.ink, canvas.paper]));
}

/** the title in two lines, as on the plate: "Main" / "& Companion" in italics */
export function titleText(name: string, size: number, x: number, y: number, fill: string): string {
  const [a, b] = name.split(" & ");
  const line = (s: string, dy: number, italic: boolean) =>
    `<text x="${x}" y="${y + dy}" font-family="Piazzolla" font-size="${size}" letter-spacing="${-0.03 * size}" fill="${fill}"${italic ? ` font-style="italic" font-weight="300"` : ` font-weight="380"`}>${esc(s)}</text>`;
  return b ? line(a, 0, false) + line(`& ${b}`, size * 0.92, true) : line(name, 0, false);
}

/** a title at 100px, to measure its width */
export const probeSvg = (name: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH * 3}" height="400">${titleText(name, 100, 0, 150, "#000")}</svg>`;

/** `titleWidth`: the width of the title at 100px */
export function ogSvg(shared: Shared, name: string, titleWidth: number): string {
  const { palette: p, canvas } = shared;
  const fill = ink(shared);
  const size = Math.min(TITLE_MAX, (100 * TITLE_WIDTH) / titleWidth);
  const top = 138;
  const swatches = [...ROLES.map((r) => p[r]), canvas.paper, canvas.ink]
    .map((c, i) => `<circle cx="${PAD + 20 + i * 52}" cy="${OG_HEIGHT - PAD - 20}" r="20" fill="${hex(c)}" stroke="${fill}" stroke-opacity=".2" stroke-width="1.5"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${hex(p.main)}"/>
  <text x="${PAD}" y="${PAD + 18}" font-family="Piazzolla" font-size="28" letter-spacing="-.28" fill="${fill}"><tspan font-weight="600">Colors</tspan><tspan font-style="italic" font-weight="300"> for interfaces</tspan></text>
  ${titleText(name, size, PAD, top + size * 0.8, fill)}
  <svg x="${ART_X}" y="${(OG_HEIGHT - ART) / 2}" width="${ART}" height="${ART}" viewBox="0 0 ${SHAPE_SIZE} ${SHAPE_SIZE}">${artGroup(shared.art, p)}</svg>
  ${swatches}
</svg>`;
}

/** the meta tags of a shared palette's page */
export function ogMeta(shared: Shared, url: string, image: string): { title: string; meta: string } {
  const { names, name } = sharedNames(shared);
  const colors = ROLES.map((r) => `${names[r]} ${hex(shared.palette[r])}`).join(", ");
  const tags = {
    "og:type": "website",
    "og:site_name": "Colors",
    "og:title": name,
    "og:description": colors,
    "og:url": url,
    "og:image": image,
    "og:image:width": String(OG_WIDTH),
    "og:image:height": String(OG_HEIGHT),
    "og:image:alt": `The palette ${name}: ${colors}`,
  };
  const meta = [
    ...Object.entries(tags).map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`),
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="description" content="${esc(colors)}">`,
    `<meta name="theme-color" content="${hex(shared.palette.main)}">`,
  ].join("\n  ");
  return { title: `${name} — Colors`, meta };
}
