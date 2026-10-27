// The link preview of a shared palette (og:image, 1200 × 630): the plate as
// in the app, landscape. Drawn as SVG and turned into a PNG on the server.
import { artGroup } from "./art.ts";
import { toHex, type Lch } from "./core/color.ts";
import { nameParts, paletteName, uniqueNames } from "./core/names.ts";
import { ROLES } from "./core/palette.ts";
import { readableOn } from "./core/readable.ts";
import { esc } from "./html.ts";
import { make, parseLink, type Shared } from "./link.ts";
import { SHAPE_SIZE } from "./shapes.ts";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const PAD = 64;
const ART = 440;
const ART_X = OG_WIDTH - PAD - ART;
/** The title's room: from the left edge to a gap before the artwork. */
export const TITLE_WIDTH = ART_X - PAD - 40;
const TITLE_MAX = 124;

/** Names as in the app: the roles, then paper and ink, without repeats. Needs the names loaded. */
export function sharedNames({ palette, canvas }: Shared) {
  const colors: [string, Lch][] = [
    ...ROLES.map((r): [string, Lch] => [r, palette[r]]),
    ["paper", canvas.paper],
    ["ink", canvas.ink],
  ];
  const names = uniqueNames(colors);
  return { names, name: paletteName(names.main, names.companion) };
}

/** Type color on the main, as on the plate: the anchor if it reads, else the most readable color. */
function typeColor({ palette: p, canvas }: Shared): string {
  return readableOn(p.main, p.anchor, [p.anchor, p.light, p.dark, p.companion], [canvas.ink, canvas.paper], 4.5);
}

/** A line of the title: the main's name upright, the companion's in italics. */
function titleLine(text: string, size: number, x: number, y: number, fill: string, italic: boolean): string {
  const weight = italic ? ` font-style="italic" font-weight="300"` : ` font-weight="380"`;
  return `<text x="${x}" y="${y}" font-family="Piazzolla" font-size="${size}" letter-spacing="${-0.03 * size}" fill="${fill}"${weight}>${esc(text)}</text>`;
}

/** The title in two lines, as on the plate: "Main" / "& Companion" in italics. */
export function titleText(name: string, size: number, x: number, y: number, fill: string): string {
  const { main, companion } = nameParts(name);
  if (!companion) return titleLine(name, size, x, y, fill, false);
  return titleLine(main, size, x, y, fill, false) + titleLine(`& ${companion}`, size, x, y + size * 0.92, fill, true);
}

/** A title at 100px, to measure its width. */
export const probeSvg = (name: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH * 3}" height="400">${titleText(name, 100, 0, 150, "#000")}</svg>`;

/** The preview image. `titleWidth` is the width of the title at 100px. */
export function ogSvg(shared: Shared, name: string, titleWidth: number): string {
  const { palette: p, canvas } = shared;
  const fill = typeColor(shared);
  const size = Math.min(TITLE_MAX, (100 * TITLE_WIDTH) / titleWidth);
  const top = 138;
  const swatches = [...ROLES.map((r) => p[r]), canvas.paper, canvas.ink]
    .map(
      (c, i) =>
        `<circle cx="${PAD + 20 + i * 52}" cy="${OG_HEIGHT - PAD - 20}" r="20" fill="${toHex(c)}" stroke="${fill}" stroke-opacity=".2" stroke-width="1.5"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${toHex(p.main)}"/>
  <text x="${PAD}" y="${PAD + 18}" font-family="Piazzolla" font-size="28" font-weight="600" letter-spacing="-.28" fill="${fill}">Colors</text>
  ${titleText(name, size, PAD, top + size * 0.8, fill)}
  <svg x="${ART_X}" y="${(OG_HEIGHT - ART) / 2}" width="${ART}" height="${ART}" viewBox="0 0 ${SHAPE_SIZE} ${SHAPE_SIZE}">${artGroup(shared.art, p)}</svg>
  ${swatches}
</svg>`;
}

/** The meta tags of a page with a link preview. */
function metaTags({
  title,
  description,
  url,
  image,
  alt,
}: {
  title: string;
  description: string;
  url: string;
  image: string;
  alt: string;
}): string {
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

/** The meta tags of a shared palette's page. */
export function ogMeta(shared: Shared, url: string, image: string): { title: string; meta: string } {
  const { names, name } = sharedNames(shared);
  const colors = ROLES.map((r) => `${names[r]} ${toHex(shared.palette[r])}`).join(", ");
  const meta = [
    metaTags({ title: name, description: colors, url, image, alt: `The palette ${name}: ${colors}` }),
    `<meta name="description" content="${esc(colors)}">`,
    `<meta name="theme-color" content="${toHex(shared.palette.main)}">`,
  ].join("\n  ");
  return { title: `${name} — Colors`, meta };
}

// ---------- the home page ----------

const HOME_LINE = "An endless feed of palettes";
/** The palettes of the home page's preview, as the tour's grid shows them: Sorx Red, Parakeet Blue, Bright Chartreuse, Velvet Cosmos. */
const HOME_KEYS = ["87brr3", "1i65bec", "o5bjjp", "y10rla"];

/** The meta tags of the home page. */
export const homeMeta = (url: string, image: string) =>
  metaTags({
    title: "Colors",
    description: `${HOME_LINE}.`,
    url,
    image,
    alt: `Colors: ${HOME_LINE.toLowerCase()}, four of them as tiles`,
  });

/** A tile as in the app's grid: the main, the name at the top, the artwork below. Needs the names loaded. */
function tile(shared: Shared, x: number, y: number, w: number, h: number): string {
  const { main, companion } = nameParts(sharedNames(shared).name);
  const fill = typeColor(shared);
  const size = w * 0.085;
  const pad = w * 0.08;
  const art = w * 0.78;
  const line = (s: string, n: number, italic: boolean) => {
    const weight = italic ? ` font-style="italic" font-weight="300"` : ` font-weight="380"`;
    return `<text x="${x + pad}" y="${y + pad + size * n}" font-family="Piazzolla" font-size="${size}" fill="${fill}"${weight}>${esc(s)}</text>`;
  };
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${toHex(shared.palette.main)}"/>
  ${line(main, 1, false)}${companion ? line(`& ${companion}`, 2, true) : ""}
  <svg x="${x + (w - art) / 2}" y="${y + h - art - (w - art) / 2}" width="${art}" height="${art}" viewBox="0 0 ${SHAPE_SIZE} ${SHAPE_SIZE}">${artGroup(shared.art, shared.palette)}</svg>`;
}

/** The home page's preview: four tiles as in the grid, below them the name and a line about the feed. Needs the names loaded. */
export function homeSvg(): string {
  const paper = "#f6f5f2";
  const text = "#151515";
  const pad = 24;
  const gap = 12;
  const band = 112;
  const w = (OG_WIDTH - 2 * pad - (HOME_KEYS.length - 1) * gap) / HOME_KEYS.length;
  const h = OG_HEIGHT - band - pad;
  const tiles = HOME_KEYS.map((k, i) => tile(make(parseLink(k)!), pad + i * (w + gap), pad, w, h)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${paper}"/>
  ${tiles}
  <text x="${pad + 8}" y="${OG_HEIGHT - 42}" font-family="Piazzolla" font-size="48" font-weight="600" letter-spacing="-1.4" fill="${text}">Colors</text>
  <text x="${OG_WIDTH - pad - 8}" y="${OG_HEIGHT - 44}" text-anchor="end" font-family="Piazzolla" font-size="26" font-weight="380" fill="${text}" fill-opacity=".7">${HOME_LINE}</text>
</svg>`;
}
