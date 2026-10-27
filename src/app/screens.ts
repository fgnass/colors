// The screens of the feed, one palette each, and the tiles of the grid.
import { artSvg } from "../art.ts";
import { toHex, type Lch } from "../core/color.ts";
import { gradientCss } from "../core/gradient.ts";
import { colorName, nameParts } from "../core/names.ts";
import { ROLES } from "../core/palette.ts";
import type { Theme } from "../core/tokens.ts";
import { esc } from "../html.ts";
import { svgUri } from "../svg.ts";
import { details } from "./details.ts";
import { ROLE_LABELS, type ColorRole, type Entry } from "./entry.ts";
import { nextEntry, prevEntry } from "./feed.ts";
import { serial, starButton, titleHeading, titleHtml, typeOn, typeOnGradient } from "./fragments.ts";
import { GRAIN, ICONS } from "./icons.ts";
import { modeInEffect } from "./layout.ts";
import { current, state } from "./state.ts";
import { allMappings, recolored, svgTargets } from "./svgArt.ts";
import { desktopUi, mobileUi } from "./ui.ts";

/** The longest line of the title, the "& " of the second line included. */
const longestLine = (name: string) => Math.max(...name.split(" & ").map((l, i) => l.length + (i ? 2 : 0)));

/** The title's size as a share of the screen's width. */
const nameSize = (name: string) => Math.min(0.15, 1.15 / (longestLine(name) * 0.48));

// ---------- the plate ----------

/** The plate: the artwork on the main, with the title and the five colors. */
export function plate(e: Entry, small = false): string {
  const p = e.palette;
  const swatches = ROLES.map((r) => `<span><i style="background:${toHex(p[r])}"></i>${toHex(p[r])}</span>`).join("");
  const type = typeOn(e, p.main, 4.5);
  return `<div class="plate${small ? " small" : ""}" style="background:${toHex(p.main)}">
    ${artSvg(e.art, p)}
    <h2 class="title" style="color:${type}">${titleHtml(e.name)}</h2>
    <div class="idx" style="color:${type}">${swatches}</div>
  </div>`;
}

/** The name of a gradient stop: the palette's name for it, else the nearest color name. */
const stopName = (e: Entry, c: Lch) => e.names[ROLES.find((r) => e.palette[r] === c)!] ?? colorName(c);

/** The gradient with the palette's name on top and its three colors at the bottom. */
function gradientTile(e: Entry): string {
  const g = e.gradient;
  const names = [g.top, g.core, g.bottom].map((c) => `<b>${esc(stopName(e, c))}</b>`).join("");
  return `<div class="grad-tile" style="background:${gradientCss(g)}">
    <h3 style="color:${typeOnGradient(e, g.top)}">${esc(nameParts(e.name).main)}</h3>
    <div class="names" style="color:${typeOnGradient(e, g.bottom)}">${names}</div></div>`;
}

/** A grid tile in the mode in effect. */
export function tileArt(e: Entry): string {
  switch (modeInEffect()) {
    case "svg":
      if (!state.svg) return plate(e, true);
      return `<div class="svg-tile" style="background:${toHex(e.canvas.paper)}"><img src="${svgUri(recolored(e))}" alt="${esc(e.name)}"></div>`;
    case "gradient":
      return gradientTile(e);
    case "light":
      return `<div class="m-tile">${mobileUi(e.themes.light, e)}</div>`;
    case "dark":
      return `<div class="m-tile">${mobileUi(e.themes.dark, e)}</div>`;
    default:
      return plate(e, true);
  }
}

// ---------- the screens: one palette, full bleed ----------

function shapesScreen(e: Entry): string {
  const p = e.palette;
  return `<div class="screen shapes" style="background:${toHex(p.main)};color:${typeOn(e, p.main, 4.5)}">
    <div class="art-area"><div class="art">${artSvg(e.art, p)}</div></div>
    <div class="no">No. ${serial(e.seed)}</div>
    <h1 class="name" style="--k:${nameSize(e.name).toFixed(3)};color:${typeOn(e, p.main)}">${titleHtml(e.name)}</h1>
  </div>`;
}

function gradientScreen(e: Entry): string {
  const g = e.gradient;
  const { main } = nameParts(e.name);
  const stop = (label: string, c: Lch) => `<div><span>${label}</span><b>${esc(stopName(e, c))}</b>${toHex(c)}</div>`;
  const stops = stop("Top", g.top) + stop("Glow", g.core) + stop("Bottom", g.bottom);
  return `<div class="screen gradient" style="background:${gradientCss(g)}">
    <div class="grain" style="background-image:${GRAIN}"></div>
    <div class="no" style="color:${typeOnGradient(e, g.top)}">No. ${serial(e.seed)}</div>
    <h1 class="name italic" style="--k:${nameSize(main).toFixed(3)};color:${typeOnGradient(e, g.top)}">${esc(main)}</h1>
    <div class="stops" style="color:${typeOnGradient(e, g.bottom)}">${stops}</div>
  </div>`;
}

function uiScreen(t: Theme, e: Entry): string {
  return `<div class="screen ui" style="background:${t.bg};color:${t.text}">
    <div class="no" style="color:${t.muted}">No. ${serial(e.seed)}</div>
    <div class="ui-stage"><div class="ui-wrap">${mobileUi(t, e)}</div><div class="w-wrap">${desktopUi(t, e)}</div></div>
  </div>`;
}

/** The invitation to load an SVG, on the SVG screen and in the grid while there is none. */
export const svgPrompt =
  () => `<div class="prompt"><h2>Your SVG</h2><p>Paste (<kbd>⌘V</kbd>), drop or choose an SVG, and see it in every palette.</p>
    <button class="act ghost" data-svg="open">Choose or paste</button>
    <button class="act ghost" data-svg="sample">Use an example</button></div>`;

/** One arrangement of the SVG's colors, small, as a button. */
function mappingButton(e: Entry, targets: ColorRole[], on: boolean): string {
  const title = targets.map((t) => ROLE_LABELS[t]).join(" · ");
  const src = svgUri(recolored(e, targets));
  return `<button class="svg-alt${on ? " on" : ""}" data-svg-alt="${targets.join(",")}" title="${title}"><img src="${src}" alt=""></button>`;
}

function svgButton(action: "download" | "open", label: string): string {
  const icon = action === "download" ? ICONS.download : ICONS.upload;
  return `<button class="svg-more" data-svg="${action}" title="${label}" aria-label="${label}">${icon}</button>`;
}

function svgScreen(e: Entry): string {
  const paper = toHex(e.canvas.paper);
  const ink = toHex(e.canvas.ink);
  if (!state.svg) return `<div class="screen svg" style="background:${paper};color:${ink}">${svgPrompt()}</div>`;
  const sample = state.svgSample;
  // All arrangements of the colors, small, the current one marked. The screens
  // before and after have them too, so they scroll along.
  const cur = svgTargets(e).join(",");
  const mappings = allMappings(e);
  const alts = mappings.map((ts) => mappingButton(e, ts, ts.join(",") === cur)).join("");
  const aspect = Math.max(0.5, Math.min(6, state.svg.aspect)).toFixed(3);
  const hint = sample
    ? `<p class="svg-hint">A sample logo, in this palette's colors. Paste (<kbd>⌘V</kbd>), drop or choose your own SVG.</p>`
    : "";
  return `<div class="screen svg" style="background:${paper};color:${ink}">
    <div class="no">No. ${serial(e.seed)}</div>
    <h2 class="svg-name">${titleHeading(e.name)}</h2>
    <div class="svg-body">
      ${hint}
      <div class="svg-big"><img src="${svgUri(recolored(e))}" alt="${sample ? "The sample logo" : "Your SVG"} in ${esc(e.name)}"></div>
      <div class="svg-row">
        <div class="svg-alts" style="--n:${mappings.length};--ar:${aspect}">${alts}</div>
        ${sample ? "" : svgButton("download", "Download the SVG in these colors")}
        ${svgButton("open", sample ? "Choose or paste your SVG" : "Replace the SVG")}
      </div>
    </div>
  </div>`;
}

function screen(e: Entry): string {
  switch (modeInEffect()) {
    case "gradient":
      return gradientScreen(e);
    case "light":
      return uiScreen(e.themes.light, e);
    case "dark":
      return uiScreen(e.themes.dark, e);
    case "svg":
      return svgScreen(e);
    case "details":
      return `<div class="screen details">${details(e)}</div>`;
    default:
      return shapesScreen(e);
  }
}

// ---------- the feed ----------

/** The feed: the screens before, of and after the current palette, on one track that slides. */
export function feedView(): string {
  const e = current();
  const prev = prevEntry();
  return `<div class="feed${modeInEffect() === "details" ? " still" : ""}"><div class="track">
      ${prev ? `<div class="slot prev">${screen(prev)}</div>` : ""}
      <div class="slot cur">${screen(e)}</div>
      <div class="slot next">${screen(nextEntry())}</div>
    </div>
    ${starButton(e, " fab")}
  </div>`;
}
