// Small pieces of HTML and type colors shared by the screens, the grid and the details.
import { toHex, type Lch } from "../core/color.ts";
import { nameParts } from "../core/names.ts";
import { mostReadable, readableOn } from "../core/readable.ts";
import { esc } from "../html.ts";
import type { Entry } from "./entry.ts";
import { STAR } from "./icons.ts";
import { onShortlist } from "./shortlist.ts";

/** The palette's number, from its seed. */
export const serial = (seed: number) => seed.toString(36).toUpperCase().padStart(7, "0");

/**
 * Type color on a palette color: the anchor if it reads, else the most
 * readable palette color, else tone-on-tone from the main scale.
 */
export function typeOn(e: Entry, bg: Lch, min = 3): string {
  const p = e.palette;
  const others = [p.anchor, p.light, p.dark, p.companion, p.main];
  return readableOn(bg, p.anchor, others, [e.scales.main[950], e.scales.main[50]], min);
}

/** Type color on a stop of the gradient: the most readable palette or canvas color, the ends of the scales as a fallback. */
export function typeOnGradient(e: Entry, bg: Lch): string {
  const { gradient: g, palette: p, canvas, scales } = e;
  const options = [g.bottom, g.top, p.anchor, p.light, p.dark, canvas.ink, canvas.paper];
  const fallbacks = [scales.neutral[950], scales.neutral[50], scales.main[950], scales.main[50]];
  return toHex(mostReadable(toHex(bg), [...options, ...fallbacks]));
}

/** The title in two lines: the main's name, then "& companion" in italics. */
export function titleHtml(name: string): string {
  const { main, companion } = nameParts(name);
  return companion ? `${esc(main)}<br><em>&amp; ${esc(companion)}</em>` : esc(name).replace(" ", "<br>");
}

/** The title on one line, the companion's name after "&" in italics. */
export function titleHeading(name: string): string {
  const { main, companion } = nameParts(name);
  return `${esc(main)} <em>&amp; ${esc(companion ?? "")}</em>`;
}

/** The star that puts the current palette on the shortlist. */
export const starButton = (e: Entry, extraClass = "") =>
  `<button class="star${extraClass}${onShortlist(e) ? " on" : ""}" data-star="current" title="Shortlist (F)" aria-label="Shortlist">${STAR}</button>`;
