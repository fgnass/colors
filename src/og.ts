// The link preview of a shared palette (og:image, 1200 × 630): the plate as
// in the app, landscape. Drawn as SVG and turned into a PNG on the server.
import { artGroup } from "./art.ts";
import { contrast, toHex, type Lch } from "./core/color.ts";
import { paletteName, uniqueNames } from "./core/names.ts";
import { ROLES } from "./core/palette.ts";
import { make, parseLink, type Shared } from "./link.ts";
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
  <text x="${PAD}" y="${PAD + 18}" font-family="Piazzolla" font-size="28" font-weight="600" letter-spacing="-.28" fill="${fill}">Colors</text>
  ${titleText(name, size, PAD, top + size * 0.8, fill)}
  <svg x="${ART_X}" y="${(OG_HEIGHT - ART) / 2}" width="${ART}" height="${ART}" viewBox="0 0 ${SHAPE_SIZE} ${SHAPE_SIZE}">${artGroup(shared.art, p)}</svg>
  ${swatches}
</svg>`;
}

/** the meta tags of a page with a link preview */
function metaTags({ title, description, url, image, alt }: { title: string; description: string; url: string; image: string; alt: string }): string {
  const tags = {
    "og:type": "website",
    "og:site_name": "Colors",
    "og:title": title,
    "og:description": description,
    "og:url": url,
    "og:image": image,
    "og:image:width": String(OG_WIDTH),
    "og:image:height": String(OG_HEIGHT),
    "og:image:alt": alt,
  };
  return [
    ...Object.entries(tags).map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`),
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n  ");
}

/** the meta tags of a shared palette's page */
export function ogMeta(shared: Shared, url: string, image: string): { title: string; meta: string } {
  const { names, name } = sharedNames(shared);
  const colors = ROLES.map((r) => `${names[r]} ${hex(shared.palette[r])}`).join(", ");
  const meta = [
    metaTags({ title: name, description: colors, url, image, alt: `The palette ${name}: ${colors}` }),
    `<meta name="description" content="${esc(colors)}">`,
    `<meta name="theme-color" content="${hex(shared.palette.main)}">`,
  ].join("\n  ");
  return { title: `${name} — Colors`, meta };
}

// ---------- the home page ----------

const HOME_LINE = "An endless feed of palettes";
/** the palettes of the home page's preview, as the tour's grid shows them: Sorx Red, Parakeet Blue, Bright Chartreuse, Velvet Cosmos */
const HOME_KEYS = ["87brr3", "1i65bec", "o5bjjp", "y10rla"];

/** the meta tags of the home page */
export const homeMeta = (url: string, image: string) =>
  metaTags({ title: "Colors", description: `${HOME_LINE}.`, url, image, alt: `Colors: ${HOME_LINE.toLowerCase()}, four of them as tiles` });

/** a tile as in the app's grid: the main, the name at the top, the artwork below (needs the names loaded) */
function tile(shared: Shared, x: number, y: number, w: number, h: number): string {
  const [a, b] = sharedNames(shared).name.split(" & ");
  const fill = ink(shared);
  const size = w * 0.085, pad = w * 0.08, art = w * 0.78;
  const line = (s: string, n: number, italic: boolean) =>
    `<text x="${x + pad}" y="${y + pad + size * n}" font-family="Piazzolla" font-size="${size}" fill="${fill}"${italic ? ` font-style="italic" font-weight="300"` : ` font-weight="380"`}>${esc(s)}</text>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${hex(shared.palette.main)}"/>
  ${line(a, 1, false)}${b ? line(`& ${b}`, 2, true) : ""}
  <svg x="${x + (w - art) / 2}" y="${y + h - art - (w - art) / 2}" width="${art}" height="${art}" viewBox="0 0 ${SHAPE_SIZE} ${SHAPE_SIZE}">${artGroup(shared.art, shared.palette)}</svg>`;
}

/** the home page's preview: four tiles as in the grid, below them the name and a line about the feed (needs the names loaded) */
export function homeSvg(): string {
  const paper = "#f6f5f2", text = "#151515";
  const pad = 24, gap = 12, band = 112;
  const w = (OG_WIDTH - 2 * pad - (HOME_KEYS.length - 1) * gap) / HOME_KEYS.length, h = OG_HEIGHT - band - pad;
  const tiles = HOME_KEYS.map((k, i) => tile(make(parseLink(k)!), pad + i * (w + gap), pad, w, h)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${paper}"/>
  ${tiles}
  <text x="${pad + 8}" y="${OG_HEIGHT - 42}" font-family="Piazzolla" font-size="48" font-weight="600" letter-spacing="-1.4" fill="${text}">Colors</text>
  <text x="${OG_WIDTH - pad - 8}" y="${OG_HEIGHT - 44}" text-anchor="end" font-family="Piazzolla" font-size="26" font-weight="380" fill="${text}" fill-opacity=".7">${HOME_LINE}</text>
</svg>`;
}
