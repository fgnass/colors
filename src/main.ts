import "@fontsource-variable/piazzolla/opsz.css";
import "@fontsource-variable/piazzolla/opsz-italic.css";
import "@fontsource-variable/instrument-sans/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./style.css";

import type { CanvasKind, Canvases } from "./core/canvas.ts";
import { contrast, cssOklch, fromHex, toGamut, toHex, type Lch } from "./core/color.ts";
import { artSvg, fillRoles, iconSvg, type Art, type ArtColors } from "./art.ts";
import { toCss, toJson, toTailwind } from "./core/export.ts";
import { gradientCss, gradientFrom, type Gradient } from "./core/gradient.ts";
import { colorName, loadNames, paletteName, uniqueNames } from "./core/names.ts";
import { HUE_FAMILIES, isNeon, ROLES, type Lockable, type Palette, type Role } from "./core/palette.ts";
import { nearestStep, STEPS } from "./core/ramp.ts";
import { createRng, randomSeed } from "./core/random.ts";
import { scales, themes, type Scales, type Theme } from "./core/tokens.ts";
import { keyOfPath, linkKey, make, parseLink, type AllLocks, type Key } from "./link.ts";
import { analyzeSvg, recolorSvg, svgUri, type SvgArt } from "./svg.ts";
import { endTour, startTour, tourActive, type TourHost } from "./tour.ts";

// ---------- model ----------

interface Entry extends Key {
  palette: Palette;
  canvas: Canvases;
  gradient: Gradient;
  art: Art;
  name: string;
  names: Record<Role | CanvasKind, string>;
  scales: Scales;
  themes: { light: Theme; dark: Theme };
}

/** what a palette is made with, besides seed and locks */
/** mood: only from old links, new palettes are as in the data */
type Setting = { mood?: number; families: string[]; neon: boolean };

function create(seed: number, locks: AllLocks = {}, { mood = 0, families, neon }: Setting = state): Entry {
  const { colors, accessible } = state;
  const { palette, plain, canvas, art } = make({ seed, locks, mood, families, neon, colors });
  // the palette colors in use, the same everywhere: the plate's (main + its fill colors)
  const roles: Role[] = ["main", ...fillRoles(plain, colors - 1)];
  const gradient = gradientFrom(palette, roles);
  const sc = scales(palette, canvas);
  const names = uniqueNames([...ROLE_ORDER.map((r) => [r, palette[r]] as [Role, Lch]), ["paper", canvas.paper], ["ink", canvas.ink]]);
  return { seed, locks, mood, families, neon, colors, accessible, palette, canvas, gradient, art, names, name: paletteName(names.main, names.companion), scales: sc, themes: themes(palette, canvas, sc, roles, accessible) };
}

const LOCKABLE: (Lockable | CanvasKind)[] = ["main", "companion", "anchor", "paper", "ink"];
const ROLE_ORDER: Role[] = ["main", "companion", "anchor", "light", "dark"];
const ROLE_INFO: Record<Role, string> = {
  main: "Main", companion: "Companion", anchor: "Anchor", light: "Main · light", dark: "Main · dark",
};
const hex = (c: Lch) => toHex(c);
const no = (seed: number) => seed.toString(36).toUpperCase().padStart(7, "0");

// ---------- state & URL ----------

/** what a screen (and a grid tile) shows; details is the phone's version of the sidebar */
type Show = "shapes" | "gradient" | "light" | "dark" | "svg" | "details";
type Tab = "scales" | "css" | "tailwind" | "json";

const state = {
  history: [] as Entry[],
  index: -1,
  /** the palette waiting below the current one, made with the current settings and locks */
  next: null as Entry | null,
  view: "feed" as "feed" | "grid",
  gridFrom: "fresh" as "fresh" | "shortlist",
  show: "shapes" as Show,
  tab: "scales" as Tab,
  families: [] as string[],
  neon: true,
  colors: 3 as ArtColors,
  accessible: false,
  /** palettes kept on the shortlist, by key */
  shortlist: [] as Entry[],
  /** a pasted SVG, shown in the palette's colors */
  svg: null as SvgArt | null,
  /** the sample logo is shown until an SVG of your own is loaded */
  svgSample: false,
  /** palette color chosen per SVG color (by its index), instead of the automatic one */
  svgRoles: {} as Record<number, SvgTarget>,
  settings: false,
  /** the feed walks the shortlist from this place in it (a palette opened from the shortlist), else null */
  walk: null as number | null,
};
const current = () => upToDate(state.index);

/** the palette at i in the feed, remade when the number of colors changed since it was made */
function upToDate(i: number): Entry {
  const e = state.history[i];
  return e.colors === state.colors && e.accessible === state.accessible ? e : (state.history[i] = create(e.seed, e.locks, e));
}

function parseKey(hash: string): { seed: number; locks: AllLocks; mood: number; families: string[]; neon: boolean; colors?: ArtColors; accessible: boolean } | null {
  const m = hash.match(/^#([0-9a-z]+)(?:~([^;]*))?((?:;[a-z]-?\d+)*)$/i);
  if (!m) return null;
  const opt = Object.fromEntries([...(m[3] ?? "").matchAll(/;([a-z])(-?\d+)/gi)].map((x) => [x[1], Number(x[2])]));
  const locks: AllLocks = {};
  for (const part of (m[2] ?? "").split(",").filter(Boolean)) {
    const [k, v] = part.split(":");
    const role = { m: "main", c: "companion", a: "anchor", p: "paper", i: "ink" }[k] as Lockable | CanvasKind | undefined;
    if (role && /^[0-9a-f]{6}$/i.test(v)) locks[role] = fromHex("#" + v);
  }
  const colors = [2, 3, 4].includes(opt.c) ? (opt.c as ArtColors) : undefined;
  const mood = Number.isFinite(opt.m) ? Math.max(-1, Math.min(1, opt.m / 100)) : 0;
  const families = [opt.f, opt.g].map((i) => HUE_FAMILIES[i]?.name).filter((f): f is string => !!f);
  return { seed: parseInt(m[1], 36), locks, mood, families, neon: opt.n === 1, colors, accessible: opt.a === 1 };
}

const readHash = () => parseKey(location.hash);

/** what makes a palette: seed, locks, mood, hue families and neon (not the artwork's color count) */
function keyOf(e: Entry): string {
  const locks = (Object.entries(e.locks) as [string, Lch][]).map(([k, c]) => `${k[0]}:${hex(c).slice(1)}`).join(",");
  const mood = e.mood ? `;m${Math.round(e.mood * 100)}` : "";
  const fams = e.families.map((f, i) => `;${"fg"[i]}${HUE_FAMILIES.findIndex((h) => h.name === f)}`).join("");
  return `#${e.seed.toString(36)}${locks ? "~" + locks : ""}${mood}${fams}${e.neon ? ";n1" : ""}`;
}

/** the link to the palette shown */
function writeLink(e: Entry) {
  history.replaceState(null, "", `/p/${linkKey(e)}`);
}

/** the favicon: the current palette's artwork in its colors */
function writeIcon(e: Entry) {
  const href = `data:image/svg+xml,${encodeURIComponent(iconSvg(e.art, e.palette))}`;
  const link = document.querySelector<HTMLLinkElement>("link[rel=icon]")!;
  if (link.href !== href) link.href = href;
}

// ---------- shortlist ----------

const SHORTLIST_KEY = "colors.shortlist";
const listed = (e: Entry) => state.shortlist.some((f) => keyOf(f) === keyOf(e));

function toggleListed(e: Entry) {
  const k = keyOf(e);
  state.shortlist = listed(e) ? state.shortlist.filter((f) => keyOf(f) !== k) : [...state.shortlist, e];
  try { localStorage.setItem(SHORTLIST_KEY, JSON.stringify(state.shortlist.map(keyOf))); } catch { /* not stored */ }
  toast(listed(e) ? "Added to the shortlist" : "Removed from the shortlist");
  render();
}

function loadShortlist() {
  try {
    const keys: string[] = JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? "[]");
    state.shortlist = keys.map(parseKey).filter((k) => k !== null).map((k) => create(k.seed, k.locks, k));
  } catch { /* no storage */ }
}

// ---------- the feed ----------
// One list of palettes: the feed scrolls it, the grid shows it a page at a time.

/** go to a palette: where it is in the feed, or appended to its end */
function push(e: Entry) {
  const i = state.history.findIndex((h) => keyOf(h) === keyOf(e));
  if (i >= 0) state.index = i;
  else { state.history.push(e); state.index = state.history.length - 1; }
  state.next = null;
  render();
}

/** the palettes at the indices made again with the same seeds, e.g. after a setting changed */
function remake(indices: number[], patch: Partial<Setting> = {}) {
  for (const i of indices) {
    const e = state.history[i];
    state.history[i] = create(e.seed, e.locks, { ...e, ...patch });
  }
  state.next = null;
}

/** while the feed walks the shortlist: its palettes above and below the current one (none below: new ones follow) */
function walkNeighbors(): { prev: number | null; next: number | null } | null {
  if (state.walk === null) return null;
  const j = state.shortlist.findIndex((f) => keyOf(f) === keyOf(current()));
  // the current one taken off the list (or changed): its place is just before the walk's place
  const [p, n] = j >= 0 ? [j - 1, j + 1] : [state.walk - 1, state.walk];
  return { prev: p >= 0 ? p : null, next: n < state.shortlist.length ? n : null };
}

/** go to a palette of the shortlist, or (null) leave it for a new palette */
function walkTo(i: number | null, e: Entry) {
  state.walk = i;
  push(e);
}

/** the palette below the current one: the next on the shortlist, the next in the feed, or a new one waiting */
function nextEntry(): Entry {
  const w = walkNeighbors();
  if (w?.next != null) return state.shortlist[w.next];
  if (!w && state.index < state.history.length - 1) return upToDate(state.index + 1);
  if (!state.next) state.next = create(randomSeed(), current()?.locks ?? {});
  return state.next;
}

/** the palette above the current one, if any */
function prevEntry(): Entry | null {
  const w = walkNeighbors();
  if (w) return w.prev === null ? null : state.shortlist[w.prev];
  return state.index > 0 ? state.history[state.index - 1] : null;
}

function goNext() {
  const w = walkNeighbors();
  if (w) walkTo(w.next, nextEntry());
  else if (state.index < state.history.length - 1) { state.index++; render(); }
  else push(nextEntry());
}

function goPrev() {
  const w = walkNeighbors();
  if (w) { if (w.prev !== null) walkTo(w.prev, state.shortlist[w.prev]); }
  else if (state.index > 0) { state.index--; render(); }
}

function toggleLock(role: Lockable | CanvasKind) {
  const e = current();
  const locks = { ...e.locks };
  if (locks[role]) delete locks[role];
  else locks[role] = role === "paper" || role === "ink" ? e.canvas[role] : e.palette[role];
  // re-create with the same seed so nothing changes visually, only the lock state
  state.history[state.index] = { ...e, locks };
  state.next = null;
  render();
}

// ---------- rendering helpers ----------

const best = (bg: Lch, options: Lch[]) => options.reduce((a, b) => (contrast(hex(b), hex(bg)) > contrast(hex(a), hex(bg)) ? b : a));

/**
 * Type color on a background: the preferred palette color if it reads,
 * else the most readable palette color, else tone-on-tone from the main scale.
 */
function inkOn(e: Entry, bg: Lch, prefer: Lch, min = 3): string {
  const p = e.palette;
  if (contrast(hex(prefer), hex(bg)) >= min) return hex(prefer);
  const pal = best(bg, [p.anchor, p.light, p.dark, p.companion, p.main]);
  if (contrast(hex(pal), hex(bg)) >= min) return hex(pal);
  return hex(best(bg, [e.scales.main[950], e.scales.main[50]]));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function titleHtml(name: string): string {
  const [a, b] = name.split(" & ");
  return b ? `${esc(a)}<br><em>&amp; ${esc(b)}</em>` : esc(name).replace(" ", "<br>");
}

/** the longest line of the title, the "& " of the second line included */
const longestLine = (name: string) => Math.max(...name.split(" & ").map((l, i) => l.length + (i ? 2 : 0)));

/** screen title size as a share of the screen's width */
const nameSize = (name: string) => Math.min(0.15, 1.15 / (longestLine(name) * 0.48));

const STAR = `<svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>`;

const LOCK_ICON = (on: boolean) => on
  ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`
  : `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"/></svg>`;

/** bar icons on one 24 grid, one stroke; shapes, sun, moon, image, swatch book and grid from Lucide (ISC) */
const icon = (body: string, strokeWidth = 1.5) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  shapes: icon(`<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>`),
  // a halftone: a row of dots per shade, growing toward the bottom
  gradient: icon(`<g fill="currentColor" stroke="none"><circle cx="4.5" cy="3.7" r="0.6"/><circle cx="9.5" cy="3.7" r="0.6"/><circle cx="14.5" cy="3.7" r="0.6"/><circle cx="19.5" cy="3.7" r="0.6"/><circle cx="4.5" cy="8.7" r="1.1"/><circle cx="9.5" cy="8.7" r="1.1"/><circle cx="14.5" cy="8.7" r="1.1"/><circle cx="19.5" cy="8.7" r="1.1"/><circle cx="4.5" cy="13.7" r="1.6"/><circle cx="9.5" cy="13.7" r="1.6"/><circle cx="14.5" cy="13.7" r="1.6"/><circle cx="19.5" cy="13.7" r="1.6"/><circle cx="4.5" cy="18.7" r="2.2"/><circle cx="9.5" cy="18.7" r="2.2"/><circle cx="14.5" cy="18.7" r="2.2"/><circle cx="19.5" cy="18.7" r="2.2"/></g>`),
  light: icon(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`),
  dark: icon(`<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`),
  svg: icon(`<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`),
  details: icon(`<path d="M9 6h12M9 12h12M9 18h12"/><g fill="currentColor" stroke="none"><circle cx="4" cy="6" r="1.4"/><circle cx="4" cy="12" r="1.4"/><circle cx="4" cy="18" r="1.4"/></g>`),
  // a swatch book; with the neon splash on, the front swatch takes the palette's neon (set by render())
  settings: icon(`<path class="splash" d="M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z"/><path d="M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7"/><path class="splash-dot" d="M7 17h.01"/><path d="m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8"/>`),
  help: icon(`<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`),
  grid: icon(`<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>`),
  close: icon(`<path d="M18 6 6 18M6 6l12 12"/>`),
  refresh: icon(`<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>`),
  check: icon(`<path d="M20 6 9 17l-5-5"/>`, 2.5),
  warn: icon(`<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`, 2),
  download: icon(`<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>`),
  upload: icon(`<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>`),
};

const SHOWS: [Show, string][] = [["shapes", "Shapes"], ["gradient", "Gradient"], ["light", "UI light"], ["dark", "UI dark"], ["svg", "Your SVG"], ["details", "Details"]];
const SHOW_KEY = "colors.show";

/** a wide screen has the sidebar, so Details is not a view of its own there */
const wide = () => window.matchMedia("(min-width: 980px)").matches;

/** the view in effect: SVG only once there is one, Details only on a phone */
function showOf(): Show {
  return state.show === "details" && wide() ? "shapes" : state.show;
}

function setShow(s: Show) {
  state.show = s;
  try { localStorage.setItem(SHOW_KEY, s); } catch { /* not stored */ }
  render();
}

// ---------- the plate and the grid tiles ----------

function plate(e: Entry, small = false): string {
  const p = e.palette;
  const idx = ROLE_ORDER.map((r) => `<span><i style="background:${hex(p[r])}"></i>${hex(p[r])}</span>`).join("");
  return `<div class="plate${small ? " small" : ""}" style="background:${hex(p.main)}">
    ${artSvg(e.art, p)}
    <h2 class="title" style="color:${inkOn(e, p.main, p.anchor, 4.5)}">${titleHtml(e.name)}</h2>
    <div class="idx" style="color:${inkOn(e, p.main, p.anchor, 4.5)}">${idx}</div>
  </div>`;
}

/** the most readable palette or canvas color on a stop of the gradient, the ends of the scales as a fallback */
const gradientInk = (e: Entry, bg: Lch) => hex(best(bg, [e.gradient.bottom, e.gradient.top, e.palette.anchor, e.palette.light, e.palette.dark, e.canvas.ink, e.canvas.paper, e.scales.neutral[950], e.scales.neutral[50], e.scales.main[950], e.scales.main[50]]));
const stopName = (e: Entry, c: Lch) => e.names[ROLE_ORDER.find((r) => e.palette[r] === c)!] ?? colorName(c);

/** the gradient with the palette's name on top and its three colors at the bottom */
function gradientTile(e: Entry): string {
  const m = e.gradient;
  const names = [m.top, m.core, m.bottom].map((c) => `<b>${esc(stopName(e, c))}</b>`).join("");
  return `<div class="grad-tile" style="background:${gradientCss(m)}">
    <h3 style="color:${gradientInk(e, m.top)}">${esc(e.name.split(" & ")[0])}</h3>
    <div class="names" style="color:${gradientInk(e, m.bottom)}">${names}</div></div>`;
}

const themeVars = (t: Theme) => Object.entries(t).map(([k, v]) => `--t-${k.replace(/[A-Z]/g, (x) => "-" + x.toLowerCase())}:${v}`).join(";");

/** activity bars: the days before in the series colors (alternating with 4 colors), today in the loud color, the days to come empty */
function activityBars(e: Entry): string {
  const rng = createRng(e.seed ^ 0x5bd1);
  return Array.from({ length: 7 }, (_, i) => `<i class="${i < 4 ? (i % 2 ? "past alt" : "past") : i === 4 ? "on" : ""}" style="height:${30 + rng() * 70}%"></i>`).join("");
}

const D_ICONS = {
  home: `<path d="M3 7.5 8 3l5 4.5V13H3z"/>`,
  folder: `<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/>`,
  users: `<circle cx="6" cy="6" r="2.2"/><path d="M2.5 13c.5-2.3 1.8-3.4 3.5-3.4s3 1.1 3.5 3.4"/><path d="M10.5 4.2a2 2 0 0 1 0 3.8M11.5 9.8c1 .5 1.7 1.5 2 3.2"/>`,
  chart: `<path d="M3 13V8M8 13V3M13 13V6"/>`,
  gear: `<circle cx="8" cy="8" r="2.2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4"/>`,
};
const dIcon = (k: keyof typeof D_ICONS) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${D_ICONS[k]}</svg>`;

/** with two data series (four colors), a legend for the bars */
const seriesLegend = (t: Theme, cls: string) => t.accent2 === t.accent ? "" :
  `<div class="${cls}"><span><i style="background:var(--t-accent)"></i>Design</span><span><i style="background:var(--t-accent2)"></i>Research</span></div>`;

// Interface preview: the loud color only in small fills (main action, logo,
// badge, today's bar, toggle), its own tint as the second series, the next
// color darkened for tags with white text; cards on a calm background.
// Sized in container widths, so it reads the same as a tile and as a screen.
function mobileUi(t: Theme, e: Entry): string {
  return `<div class="m-ui" style="${themeVars(t)}">
    <div class="m-top"><div class="m-logo">${esc(e.name[0])}</div><b>${esc(e.name.split(" & ")[0])}</b><div class="m-avatar"></div></div>
    <div class="m-card"><div class="m-label">Weekly activity</div>
      <div class="m-row"><span class="m-big">2,481</span><span class="m-badge">+12.4%</span></div>
      <div class="m-bars">${activityBars(e)}</div>${seriesLegend(t, "m-legend")}</div>
    <div class="m-pair"><span class="m-chip second">Design<b>12</b></span><span class="m-chip">Research<b>7</b></span></div>
    <ul class="m-list"><li>Notifications<span class="m-toggle"></span></li></ul>
    <div class="m-more m-projects"><div class="m-label">Projects</div><ul class="m-list">${(["companion", "anchor", "dark"] as Role[]).map((r, i) => `<li><b>${esc(e.names[r])}</b><span class="m-tag${i % 2 ? "" : " second"}">${["Design", "Research", "Launch"][i]}</span></li>`).join("")}</ul></div>
    <div class="m-more m-today"><div class="m-label">Today</div><ul class="m-list m-tasks"><li class="done"><i></i>Review the palette</li><li><i></i>Ship the new theme</li></ul></div>
    <div class="m-btns"><span class="m-btn p">Create</span><span class="m-btn o">Import</span></div>
    <div class="m-more m-tabs">${(["home", "folder", "users", "gear"] as const).map((k, i) => `<span${i ? "" : ` class="on"`}>${dIcon(k)}</span>`).join("")}</div>
  </div>`;
}

// The same interface on a wide screen, in a desktop app's sizes: navigation,
// key figures, a table of projects (named after the palette's colors) and
// settings. The colors play the same parts as on the phone.
function desktopUi(t: Theme, e: Entry): string {
  const rng = createRng(e.seed ^ 0xd35c);
  const nav = ([["home", "Overview"], ["folder", "Projects"], ["users", "Team"], ["chart", "Reports"], ["gear", "Settings"]] as const)
    .map(([icon, label], i) => `<li${i ? "" : ` class="on"`}>${dIcon(icon)}${label}</li>`).join("");
  const tags = [["Design", "second"], ["Research", ""], ["Launch", "second"], ["Content", ""]];
  const status = ["In review", "Active", "Active", "Draft"];
  const projects = (["companion", "anchor", "light", "dark"] as Role[]).map((r, i) => {
    const done = Math.round(20 + rng() * 75);
    return `<tr><td><b>${esc(e.names[r])}</b></td><td><span class="w-tag ${tags[i][1]}">${tags[i][0]}</span></td><td class="w-muted">${status[i]}</td><td><span class="w-progress"><i style="width:${done}%"></i></span></td><td class="w-num">${done}%</td></tr>`;
  }).join("");
  const toggle = (label: string, on: boolean) => `<li>${label}<span class="w-toggle${on ? "" : " off"}"></span></li>`;
  return `<div class="w-ui" style="${themeVars(t)}">
    <div class="w-nav">
      <div class="w-brand"><div class="w-logo">${esc(e.name[0])}</div><b>${esc(e.name.split(" & ")[0])}</b></div>
      <ul>${nav}</ul>
      <div class="w-plan"><div class="w-label">Storage</div><span class="w-progress"><i style="width:72%"></i></span><div class="w-muted">7.2 of 10 GB</div></div>
    </div>
    <div class="w-main">
      <div class="w-head"><b class="w-h">Overview</b><span class="w-search">Search…</span><span class="w-btn p">Create</span><span class="w-avatar"></span></div>
      <div class="w-stats">
        <div class="w-card"><div class="w-label">Weekly activity</div><div class="w-row"><span class="w-big">2,481</span><span class="w-badge">+12.4%</span></div><div class="m-bars w-bars">${activityBars(e)}</div>${seriesLegend(t, "w-legend")}</div>
        <div class="w-card"><div class="w-label">Open tasks</div><div class="w-row"><span class="w-big">38</span><span class="w-muted">6 due today</span></div><span class="w-progress"><i style="width:64%"></i></span><div class="w-muted">64% of the sprint done</div></div>
        <div class="w-card"><div class="w-label">Team</div><div class="w-row"><span class="w-big">12</span><span class="w-muted">members</span></div><div class="w-pair"><span class="w-tag second">Design 5</span><span class="w-tag">Research 7</span></div></div>
      </div>
      <div class="w-split">
        <div class="w-card w-table"><div class="w-title">Projects<span class="w-link">View all</span></div><table>${projects}</table></div>
        <div class="w-card"><div class="w-title">Notifications</div>
          <ul class="w-list">${toggle("Mentions", true)}${toggle("Weekly report", true)}${toggle("Product news", false)}</ul>
          <div class="w-btns"><span class="w-btn p">Save</span><span class="w-btn o">Cancel</span></div></div>
      </div>
    </div>
  </div>`;
}

const recolored = (e: Entry) => recolorSvg(state.svg!, svgTargets(e).map((t) => hex(targetColor(e, t))));

function tileArt(e: Entry): string {
  switch (showOf()) {
    case "svg": if (!state.svg) return plate(e, true);
      return `<div class="svg-tile" style="background:${hex(e.canvas.paper)}"><img src="${svgUri(recolored(e))}" alt="${esc(e.name)}"></div>`;
    case "gradient": return gradientTile(e);
    case "light": return `<div class="m-tile">${mobileUi(e.themes.light, e)}</div>`;
    case "dark": return `<div class="m-tile">${mobileUi(e.themes.dark, e)}</div>`;
    default: return plate(e, true);
  }
}

// ---------- your SVG ----------

type SvgTarget = Role | CanvasKind;
const SVG_TARGETS: SvgTarget[] = [...ROLE_ORDER, "paper", "ink"];
const TARGET_INFO: Record<SvgTarget, string> = { ...ROLE_INFO, paper: "Light canvas", ink: "Dark canvas" };
const targetColor = (e: Entry, t: SvgTarget) => (t === "paper" || t === "ink" ? e.canvas[t] : e.palette[t]);

/** like a plate: the largest color takes the main, the others the fill colors that read on it */
function autoTargets(e: Entry, n: number): SvgTarget[] {
  // larger shapes need lightness contrast to keep their form; a vivid color with little contrast suits the small ones
  const main = hex(e.palette.main);
  // as many palette colors as the Colors setting allows, the main included
  const fills = fillRoles(e.palette, Math.min(n - 1, e.colors - 1)).sort((a, b) => contrast(hex(e.palette[b]), main) - contrast(hex(e.palette[a]), main));
  return Array.from({ length: n }, (_, i) => (i === 0 ? "main" : fills[(i - 1) % fills.length]));
}

function svgTargets(e: Entry): SvgTarget[] {
  return autoTargets(e, state.svg!.colors.length).map((t, i) => state.svgRoles[i] ?? t);
}

/** the next lexicographic permutation, around to the first after the last */
function nextPerm(ids: number[]): number[] {
  const p = [...ids];
  let i = p.length - 2;
  while (i >= 0 && p[i] >= p[i + 1]) i--;
  if (i < 0) return p.sort((a, b) => a - b);
  let j = p.length - 1;
  while (p[j] <= p[i]) j--;
  [p[i], p[j]] = [p[j], p[i]];
  return [...p.slice(0, i + 1), ...p.slice(i + 1).reverse()];
}

/** all arrangements of the SVG's colors, in order (at most `max`: five colors make 120) */
function allMappings(e: Entry, max = 120): SvgTarget[][] {
  const start = svgTargets(e).map((t) => SVG_TARGETS.indexOf(t)).sort((a, b) => a - b);
  const out: SvgTarget[][] = [start.map((id) => SVG_TARGETS[id])];
  for (let p = nextPerm(start); out.length < max && p.join() !== start.join(); p = nextPerm(p)) out.push(p.map((id) => SVG_TARGETS[id]));
  return out;
}

function setMapping(targets: SvgTarget[]) {
  state.svgRoles = Object.fromEntries(targets.map((t, k) => [k, t]));
  saveRoles();
  render();
}

// ---------- screens: one palette, full bleed ----------

function screen(e: Entry): string {
  switch (showOf()) {
    case "gradient": return gradientScreen(e);
    case "light": return uiScreen(e.themes.light, e);
    case "dark": return uiScreen(e.themes.dark, e);
    case "svg": return svgScreen(e);
    case "details": return `<div class="screen details">${details(e)}</div>`;
    default: return shapesScreen(e);
  }
}

function shapesScreen(e: Entry): string {
  const p = e.palette;
  return `<div class="screen shapes" style="background:${hex(p.main)};color:${inkOn(e, p.main, p.anchor, 4.5)}">
    <div class="art-area"><div class="art">${artSvg(e.art, p)}</div></div>
    <div class="no">No. ${no(e.seed)}</div>
    <h1 class="name" style="--k:${nameSize(e.name).toFixed(3)};color:${inkOn(e, p.main, p.anchor)}">${titleHtml(e.name)}</h1>
  </div>`;
}

const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

function gradientScreen(e: Entry): string {
  const m = e.gradient;
  const stop = (label: string, c: Lch) => `<div><span>${label}</span><b>${esc(stopName(e, c))}</b>${hex(c)}</div>`;
  return `<div class="screen gradient" style="background:${gradientCss(m)}">
    <div class="grain" style="background-image:${GRAIN}"></div>
    <div class="no" style="color:${gradientInk(e, m.top)}">No. ${no(e.seed)}</div>
    <h1 class="name italic" style="--k:${nameSize(e.name.split(" & ")[0]).toFixed(3)};color:${gradientInk(e, m.top)}">${esc(e.name.split(" & ")[0])}</h1>
    <div class="stops" style="color:${gradientInk(e, m.bottom)}">${stop("Top", m.top)}${stop("Glow", m.core)}${stop("Bottom", m.bottom)}</div>
  </div>`;
}

function uiScreen(t: Theme, e: Entry): string {
  return `<div class="screen ui" style="background:${t.bg};color:${t.text}">
    <div class="no" style="color:${t.muted}">No. ${no(e.seed)}</div>
    <div class="ui-stage"><div class="ui-wrap">${mobileUi(t, e)}</div><div class="w-wrap">${desktopUi(t, e)}</div></div>
  </div>`;
}

/** the invitation to load an SVG: the SVG screen, and the grid, while there is none */
const svgPrompt = () => `<div class="prompt"><h2>Your SVG</h2><p>Paste (<kbd>⌘V</kbd>), drop or choose an SVG, and see it in every palette.</p>
    <button class="act ghost" data-svg="open">Choose or paste</button>
    <button class="act ghost" data-svg="sample">Use an example</button></div>`;

function svgScreen(e: Entry): string {
  const paper = hex(e.canvas.paper), ink = hex(e.canvas.ink);
  if (!state.svg) return `<div class="screen svg" style="background:${paper};color:${ink}">${svgPrompt()}</div>`;
  const svg = state.svg;
  const src = svgUri(recolored(e));
  const targets = svgTargets(e);
  // all arrangements of the colors, small, the current one marked (on the screens before and after too, so they scroll along)
  const cur = targets.join(",");
  const mappings = allMappings(e);
  const alts = mappings.map((ts) => `<button class="svg-alt${ts.join(",") === cur ? " on" : ""}" data-svg-alt="${ts.join(",")}" title="${ts.map((t) => TARGET_INFO[t]).join(" · ")}"><img src="${svgUri(recolorSvg(svg, ts.map((t) => hex(targetColor(e, t)))))}" alt=""></button>`).join("");
  return `<div class="screen svg" style="background:${paper};color:${ink}">
    <div class="no">No. ${no(e.seed)}</div>
    <h2 class="svg-name">${esc(e.name.split(" & ")[0])} <em>&amp; ${esc(e.name.split(" & ")[1] ?? "")}</em></h2>
    <div class="svg-body">
      ${state.svgSample ? `<p class="svg-hint">A sample logo, in this palette's colors. Paste (<kbd>⌘V</kbd>), drop or choose your own SVG.</p>` : ""}
      <div class="svg-big"><img src="${src}" alt="${state.svgSample ? "The sample logo" : "Your SVG"} in ${esc(e.name)}"></div>
      <div class="svg-row">
        <div class="svg-alts" style="--n:${mappings.length};--ar:${Math.max(0.5, Math.min(6, svg.aspect)).toFixed(3)}">${alts}</div>
        ${state.svgSample ? "" : `<button class="svg-more" data-svg="download" title="Download the SVG in these colors" aria-label="Download the SVG in these colors">${ICONS.download}</button>`}
        <button class="svg-more" data-svg="open" title="${state.svgSample ? "Choose or paste your SVG" : "Replace the SVG"}" aria-label="${state.svgSample ? "Choose or paste your SVG" : "Replace the SVG"}">${ICONS.upload}</button>
      </div>
    </div>
  </div>`;
}

// ---------- details: the sidebar, and a screen of its own on a phone ----------

function roleRow(e: Entry, role: SvgTarget): string {
  const canvas = role === "paper" || role === "ink";
  const c = canvas ? e.canvas[role] : e.palette[role];
  const h = hex(c);
  const lockable = (LOCKABLE as string[]).includes(role);
  const on = lockable && !!e.locks[role as Lockable];
  // the contrast with the canvas the color sits on: palette colors on the light canvas, each canvas against the other
  const against = canvas ? (role === "paper" ? "ink" : "paper") : "paper";
  const ratio = contrast(h, hex(e.canvas[against]));
  // the WCAG rating for text in this color on that canvas
  const rating = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "no text";
  const mark = rating === "no text" ? ICONS.warn : ICONS.check;
  const canvasName = against === "paper" ? "light" : "dark";
  const key = LOCKABLE.indexOf(role as Lockable) + 1;
  return `<li class="role${lockable ? "" : " derived"}">
    <button class="chip" style="background:${h}" data-copy="${h}" aria-label="Copy ${h}"></button>
    <div class="what"><div class="name">${esc(e.names[role])}</div><div class="label" title="Text in this color on the ${canvasName} canvas (${hex(e.canvas[against])}): contrast ${ratio.toFixed(1)}:1">${TARGET_INFO[role]} <b class="wcag${rating === "no text" ? " fail" : ""}">${mark}${rating}</b></div></div>
    <button class="hex" data-copy="${cssOklch(c)}" title="Copy ${cssOklch(c)}">${h}</button>
    ${lockable ? `<button class="lock${on ? " on" : ""}" data-lock="${role}" title="Lock (${key})" aria-label="Lock ${TARGET_INFO[role]}">${LOCK_ICON(on)}</button>` : "<span></span>"}
  </li>`;
}

function exportText(e: Entry): string {
  if (state.tab === "tailwind") return toTailwind(e.palette, e.canvas, e.scales, gradientCss(e.gradient));
  if (state.tab === "json") return toJson(e.palette, e.canvas, e.scales, e.themes);
  return toCss(e.palette, e.canvas, e.scales, e.themes, gradientCss(e.gradient));
}

function scaleRows(e: Entry): string {
  const row = (key: keyof Scales, src?: Lch) => {
    const r = e.scales[key];
    const home = src ? nearestStep(src) : -1;
    return `<div class="scale">${STEPS.map((s) => {
      const h = hex(r[s]);
      return `<button class="${s === home ? "home" : ""}" style="background:${h}" data-copy="${h}" title="${key}-${s} ${h}" aria-label="${key}-${s} ${h}"></button>`;
    }).join("")}</div>`;
  };
  return `<div class="scales">${row("main", e.palette.main)}${row("companion", e.palette.companion)}${row("anchor", e.palette.anchor)}${row("neutral")}
    <div class="steps">${STEPS.map((s) => `<span>${s}</span>`).join("")}</div></div>`;
}

function details(e: Entry): string {
  const tab = (id: Tab, label: string) => `<button class="${state.tab === id ? "on" : ""}" data-tab="${id}">${label}</button>`;
  const locks = Object.keys(e.locks);
  const panel = state.tab === "scales" ? scaleRows(e) : `<pre>${esc(exportText(e))}</pre>`;
  return `<div class="d-head">
      <div class="d-title"><h2>${esc(e.name.split(" & ")[0])} <em>&amp; ${esc(e.name.split(" & ")[1] ?? "")}</em></h2>
        ${locks.length ? `<div class="meta">${locks.map((l) => TARGET_INFO[l as SvgTarget]).join(" + ")} locked</div>` : ""}</div>
      <button class="star${listed(e) ? " on" : ""}" data-star="current" title="Shortlist (F)" aria-label="Shortlist">${STAR}</button>
    </div>
    <ul class="roles">${[...ROLE_ORDER, "paper" as const, "ink" as const].map((r) => roleRow(e, r)).join("")}</ul>
    <div class="tabs">${tab("scales", "Scales")}${tab("css", "CSS")}${tab("tailwind", "Tailwind")}${tab("json", "JSON")}
      <button class="copy" data-copy-export title="Copy ${state.tab === "scales" ? "CSS" : state.tab}">Copy</button></div>
    <div class="panel">${panel}</div>
    <div class="dl"><div class="label">Share</div>
      <div class="btns"><button class="act ghost" data-copy-link>Copy link</button></div></div>`;
}

/** the artwork starts below the title, like on a plate: the title's height depends on its lines */
function placeArt() {
  document.querySelectorAll<HTMLElement>(".screen.shapes").forEach((screen) => {
    const h1 = screen.querySelector<HTMLElement>(".name")!;
    screen.style.setProperty("--art-top", `${h1.offsetTop + h1.offsetHeight + 56}px`);
  });
}

/** the phone interface on a screen: its extra blocks as far as they fit, the last one first to go */
function fitUi() {
  document.querySelectorAll<HTMLElement>(".screen.ui .ui-wrap .m-ui").forEach((ui) => {
    const extra = [...ui.querySelectorAll<HTMLElement>(".m-projects, .m-today")];
    extra.forEach((x) => (x.hidden = false));
    for (const x of extra.reverse()) {
      if (ui.scrollHeight <= ui.clientHeight + 1) break;
      x.hidden = true;
    }
  });
}

// ---------- the feed ----------

function feed(): string {
  const e = current();
  const prev = prevEntry();
  return `<div class="feed${showOf() === "details" ? " still" : ""}"><div class="track">
      ${prev ? `<div class="slot prev">${screen(prev)}</div>` : ""}
      <div class="slot cur">${screen(e)}</div>
      <div class="slot next">${screen(nextEntry())}</div>
    </div>
    <button class="star fab${listed(e) ? " on" : ""}" data-star="current" title="Shortlist (F)" aria-label="Shortlist">${STAR}</button>
  </div>`;
}

// ---------- the grid ----------

/** the text color of a tile, for the star on it */
function tileInk(e: Entry): string {
  switch (showOf()) {
    case "gradient": return gradientInk(e, e.gradient.top);
    case "light": return e.themes.light.text;
    case "dark": return e.themes.dark.text;
    case "svg": if (state.svg) return hex(e.canvas.ink);
    // falls through: the plate
    default: return inkOn(e, e.palette.main, e.palette.anchor, 4.5);
  }
}

function gridView(): string {
  const entries = state.gridFrom === "shortlist" ? state.shortlist : page().entries;
  const cur = keyOf(current());
  const tiles = showOf() === "svg" && !state.svg
    ? `<div class="wall-prompt">${svgPrompt()}</div>`
    : entries.length
    ? `<div class="wall">${entries.map((e, i) => `<div class="item${listed(e) ? " listed" : ""}${keyOf(e) === cur ? " cur" : ""}" data-pick="${i}">${tileArt(e)}
        <button class="star${listed(e) ? " on" : ""}" data-star="${i}" style="color:${tileInk(e)}" title="Shortlist" aria-label="Shortlist">${STAR}</button></div>`).join("")}</div>`
    : `<div class="empty">No palettes on the shortlist yet. Star the ones you like (<kbd>F</kbd> or the star on a tile), and they stay when you generate new ones.</div>`;
  return `<div class="grid-view">
    <div class="grid-head">
      <div class="seg" role="group" aria-label="Which palettes">
        <button class="${state.gridFrom === "fresh" ? "on" : ""}" data-action="fresh">Fresh</button>
        <button class="${state.gridFrom === "shortlist" ? "on" : ""}" data-action="shortlist">Shortlist <output>${state.shortlist.length || ""}</output> <kbd class="hide-s">S</kbd></button>
      </div>
      <div class="spacer"></div>
      <output class="page hide-s" title="Page of the feed">Page ${page().start / pageSize() + 1}</output>
      <button class="round hide-l" data-action="newset" title="New set (Space)" aria-label="New set">${ICONS.refresh}</button>
      <button class="round" data-action="tour" title="The tour" aria-label="The tour">${ICONS.help}</button>
      <button class="round" data-action="close" title="Back (Esc)" aria-label="Close grid">${ICONS.close}</button>
    </div>
    ${tiles}
  </div>`;
}

const GRID_GAP = 20;

/**
 * The grid with the most tiles that still read (150px wide) and cover three
 * quarters of the viewport, else the one that covers the most of it.
 * On a phone: two columns of twelve, scrolling.
 */
function gridLayout(): { cols: number; rows: number; size: number } {
  const pad = window.innerWidth > 700 ? 40 : 16;
  const w = Math.min(window.innerWidth, 1600) - pad * 2;
  if (window.innerWidth <= 700) return { cols: 2, rows: 6, size: (w - GRID_GAP) / 2 };
  const top = 28 + 40 + 16;
  const bottom = 48 + 48;
  // the tour's line of hints takes room at the bottom
  const tour = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tour")) || 0;
  const h = window.innerHeight - tour - top - bottom;
  const aspect = 5 / 4;
  // the most tiles that still read (150px) and cover three quarters of the room; none: the best cover
  let best = { cols: 2, rows: 1, size: (w - GRID_GAP) / 2, cover: 0 };
  for (let rows = 1; rows <= 8; rows++) {
    for (let cols = 1; cols <= 16; cols++) {
      const size = Math.min((w - GRID_GAP * (cols - 1)) / cols, ((h + GRID_GAP) / rows - GRID_GAP) / aspect);
      if (size < 150) break;
      const cover = (cols * rows * size * size * aspect) / (w * h);
      const better = best.cover < 0.75 ? cover > best.cover : cover >= 0.75 && cols * rows > best.cols * best.rows;
      if (better) best = { cols, rows, size, cover };
    }
  }
  return best;
}

/** the grid's page: as many palettes as fill the viewport */
const pageSize = () => { const l = gridLayout(); return l.cols * l.rows; };

function fitGrid() {
  const el = document.querySelector<HTMLElement>(".wall");
  if (!el) return;
  // on a phone two columns that scroll
  const l = gridLayout();
  el.style.gridTemplateColumns = window.innerWidth <= 700 ? "repeat(2, 1fr)" : `repeat(${l.cols}, ${Math.floor(l.size)}px)`;
}

/** the feed filled with new palettes up to n, made with the current palette's locks */
function extend(n: number) {
  const base = current();
  while (state.history.length < n) state.history.push(create(randomSeed(), base.locks));
}

/** the page of the feed the current palette is on, filled up so it is full */
function page(): { start: number; entries: Entry[] } {
  const n = pageSize();
  const start = Math.floor(state.index / n) * n;
  extend(start + n);
  return { start, entries: Array.from({ length: n }, (_, i) => upToDate(start + i)) };
}

/** the indices of the page's palettes that are not on the shortlist */
const pageIndices = () => { const { start, entries } = page(); return entries.map((e, i) => (listed(e) ? -1 : start + i)).filter((i) => i >= 0); };

function openGrid() {
  state.view = "grid";
  state.walk = null;
  state.gridFrom = "fresh";
  render();
}

/** a page of new palettes after the end of the feed */
function newSet() {
  const n = pageSize();
  const start = Math.ceil(state.history.length / n) * n;
  extend(start + n);
  state.index = start;
  state.next = null;
  openGrid();
}

function pick(i: number): Entry {
  return state.gridFrom === "shortlist" ? state.shortlist[i] : state.history[page().start + i];
}

// ---------- render ----------

/** the palette's neon, else its most colorful color: the splash on the settings button */
function neonOf(e: Entry): Lch {
  const colors = ROLES.map((r) => e.palette[r]);
  return colors.find(isNeon) ?? colors.reduce((a, b) => (b.c > a.c ? b : a));
}

function render() {
  const e = current();
  document.body.classList.toggle("grid", state.view === "grid");
  document.body.classList.toggle("settings-open", state.settings);
  if (state.view === "feed") {
    writeLink(e);
    writeIcon(e);
    document.title = `${e.name} — Colors`;
  }
  document.querySelector("main")!.innerHTML = state.view === "grid" ? gridView() : feed();
  document.querySelector(".side")!.innerHTML = details(e);
  placeArt();
  fitUi();
  const show = showOf();
  document.querySelectorAll<HTMLElement>("[data-show]").forEach((b) => {
    const s = b.dataset.show as Show;
    b.classList.toggle("on", s === show || (s === "details" && state.show === "details" && !wide()));
  });
  document.querySelector("[data-action=grid]")!.classList.toggle("on", state.view === "grid");
  const settings = document.querySelector<HTMLElement>("[data-action=settings]")!;
  settings.classList.toggle("on", state.settings);
  settings.classList.toggle("neon", state.neon);
  document.body.style.setProperty("--neon", hex(neonOf(e)));
  // the wordmark in the text color of the screen under it (its number sits where the wordmark does)
  const under = document.querySelector<HTMLElement>(".slot.cur .no") ?? document.querySelector<HTMLElement>(".slot.cur .screen");
  if (under) document.body.style.setProperty("--wordmark", getComputedStyle(under).color);
  fitGrid();
  // the single palette shows its own settings; new ones are made with them
  if (state.view === "feed") { state.families = e.families; state.neon = e.neon; }
  document.querySelector<HTMLInputElement>("#neon")!.checked = state.neon;
  document.querySelector<HTMLInputElement>("#accessible")!.checked = state.accessible;
  document.querySelectorAll<HTMLElement>("[data-family]").forEach((b) => {
    const n = state.families.filter((f) => f === b.dataset.family).length;
    b.classList.toggle("on", b.dataset.family ? n > 0 : !state.families.length);
    b.classList.toggle("twice", n === 2);
  });
  document.querySelectorAll<HTMLElement>("[data-colors]").forEach((b) => b.classList.toggle("on", Number(b.dataset.colors) === state.colors));
}

/**
 * Up to two hue families. Clicking a hue adds it; clicking the only one again
 * makes it monochrome, a third click removes it; a third hue replaces the older one.
 */
function pickFamily(f: string | undefined) {
  const sel = state.families;
  if (!f) return setFamilies([]);
  const n = sel.filter((x) => x === f).length;
  if (n === 2) return setFamilies([]);
  if (n === 1) return setFamilies(sel.length === 1 ? [f, f] : sel.filter((x) => x !== f));
  setFamilies(sel.length < 2 ? [...sel, f] : [sel[1] === sel[0] ? sel[0] : sel[1], f]);
}

/** new palettes with the hue families, from the same seed; new ones in the grid */
function setFamilies(families: string[]) {
  state.families = families;
  remake(state.view === "grid" ? pageIndices() : [state.index], { families });
  render();
}

function setNeon(neon: boolean) {
  state.neon = neon;
  remake(state.view === "grid" ? pageIndices() : [state.index], { neon });
  render();
}

const ACCESSIBLE_KEY = "colors.accessible";

/** Same palettes, interface tokens made to pass WCAG AA or as they are (the feed's palettes are remade as they come up). */
function setAccessible(on: boolean, store = true) {
  state.accessible = on;
  state.next = null;
  state.shortlist = state.shortlist.map((w) => create(w.seed, w.locks, w));
  if (store) try { localStorage.setItem(ACCESSIBLE_KEY, on ? "1" : ""); } catch { /* not stored */ }
  render();
}

/** Same palettes, recolored artwork (the feed's palettes are remade as they come up). */
function setColors(n: ArtColors) {
  state.colors = n;
  state.next = null;
  state.shortlist = state.shortlist.map((w) => create(w.seed, w.locks, w));
  render();
}

function toggleSettings(open = !state.settings) {
  state.settings = open;
  document.body.classList.toggle("settings-open", open);
  document.querySelector("[data-action=settings]")!.classList.toggle("on", open);
}

/** The chrome is rendered once: the bar, the sidebar, the settings sheet, the SVG dialog. */
function mount() {
  const showButtons = SHOWS.map(([s, label]) => `<button data-show="${s}" class="${s === "details" ? "hide-l" : ""}" title="${label} (V)" aria-label="${label}">${ICONS[s]}</button>`).join("");
  document.querySelector("#app")!.innerHTML = `
    <button class="wordmark" data-action="tour" title="Colors: the tour">Colors</button>
    <main></main>
    <aside class="side" aria-label="Palette details"></aside>
    <nav class="bar">
      <div class="show" role="group" aria-label="Show">${showButtons}</div>
      <button class="round" data-action="settings" title="Settings" aria-label="Settings">${ICONS.settings}</button>
      <button class="newset" data-action="newset">New set <kbd>Space</kbd></button>
      <button class="round" data-action="grid" title="Grid (G)" aria-label="Grid">${ICONS.grid}</button>
    </nav>
    <div class="scrim" data-action="settings"></div>
    <section class="settings" aria-label="Settings">
      <div class="handle"></div>
      <div class="field hues-field">
        <div class="label">Hue family</div>
        <div class="hues" role="group" aria-label="Hue families" title="Hues the palettes must contain, in any role. Tap a second hue for two; tap a hue twice for a monochrome palette.">
          <button data-family="" class="any" title="Any hue">Any</button>
          ${HUE_FAMILIES.map((f) => `<button data-family="${f.name}" title="${f.name[0].toUpperCase() + f.name.slice(1)}" aria-label="${f.name}" style="--dot:${hex(toGamut({ l: 0.7, c: 0.15, h: f.hue }))}"></button>`).join("")}
        </div>
        <div class="hint">Tap a second hue for two, twice for monochrome.</div>
      </div>
      <div class="field row colors-field">
        <div><div class="label">Colors</div><div class="hint">In the artwork, background included (C)</div></div>
        <div class="seg" role="group" aria-label="Colors in the artwork">${[2, 3, 4].map((n) => `<button data-colors="${n}">${n}</button>`).join("")}</div>
      </div>
      <label class="field row neon-field">
        <div><div class="label">Neon splash <svg class="neon-splash" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.6c1.5-.4 2 1.6 3.3 2.2 1.4.6 3.4-.4 4 1 .6 1.5-1.3 2.4-1.2 3.9.1 1.4 2.2 2.4 1.5 3.8-.7 1.4-2.8.6-4 1.5-1.2.9-1.2 3.1-2.8 3.2-1.5.1-1.8-2-3-2.9-1.2-.9-3.4-.5-3.9-2-.5-1.4 1.5-2.3 1.5-3.7 0-1.5-1.9-2.6-1.2-3.9.7-1.4 2.8-.4 4-1.2.8-.6 1-1.7 1.8-1.9Z"/><circle cx="20.2" cy="4.6" r="1.5"/><circle cx="3.6" cy="4.2" r="1.1"/><circle cx="21" cy="19.6" r="1.1"/><circle cx="4.4" cy="20.6" r="1.4"/></svg></div><div class="hint">The palette as it is, the color closest to a neon made neon</div></div>
        <input id="neon" type="checkbox"><span class="switch"></span>
      </label>
      <label class="field row accessible-field">
        <div><div class="label">Accessible tokens</div><div class="hint">Interface colors pass WCAG AA in light and dark mode; the palette stays as it is</div></div>
        <input id="accessible" type="checkbox"><span class="switch"></span>
      </label>
    </section>
    <div class="toast"></div>
    <dialog class="svg-dialog"><form method="dialog">
      <h2>Your SVG</h2>
      <p>Paste the SVG code, or choose a file. You can also paste (<kbd>⌘V</kbd>) or drop an SVG anywhere on the page.</p>
      <textarea name="code" spellcheck="false" placeholder="<svg …>"></textarea>
      <div class="row"><label class="act ghost">Choose file<input type="file" accept=".svg,image/svg+xml" hidden></label><span class="spacer"></span>
        <button class="act ghost" value="cancel">Cancel</button><button class="act primary" value="use">Use</button></div>
    </form></dialog>`;
  const dialog = document.querySelector<HTMLDialogElement>(".svg-dialog")!;
  dialog.addEventListener("close", () => {
    const code = dialog.querySelector("textarea")!;
    if (dialog.returnValue === "use" && code.value.trim()) loadSvg(code.value);
    code.value = "";
  });
  dialog.querySelector<HTMLInputElement>("input[type=file]")!.addEventListener("change", async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) { dialog.close(); loadSvg(await file.text()); }
  });
  document.querySelectorAll<HTMLElement>("[data-colors]").forEach((b) =>
    b.addEventListener("click", () => setColors(Number(b.dataset.colors) as ArtColors)));
  document.querySelectorAll<HTMLElement>("[data-family]").forEach((b) =>
    b.addEventListener("click", () => pickFamily(b.dataset.family || undefined)));
  document.querySelector<HTMLInputElement>("#neon")!.addEventListener("change", (ev) => setNeon((ev.target as HTMLInputElement).checked));
  document.querySelector<HTMLInputElement>("#accessible")!.addEventListener("change", (ev) => setAccessible((ev.target as HTMLInputElement).checked));
  swipe();
}

// ---------- the tour ----------

const SEEN_KEY = "colors.seen";

/** the tour in the live app: a line of hints, one thing to try at a time, until all was tried */
function tour() {
  if (tourActive()) return endTour();
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* not stored */ }
  const host: TourHost = {
    wide,
    probe: () => ({ index: state.index, show: state.show, settings: state.settings, svg: !!state.svg, view: state.view, from: state.gridFrom, listed: state.shortlist.length }),
    // the tour starts on one palette, with the shapes
    feed: () => { if (state.view !== "feed" || state.show !== "shapes") { state.view = "feed"; state.show = "shapes"; render(); } },
  };
  startTour(host);
}

// ---------- interaction ----------

function toast(msg: string) {
  const t = document.querySelector(".toast")!;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout((toast as { timer?: number }).timer);
  (toast as { timer?: number }).timer = window.setTimeout(() => t.classList.remove("show"), 1300);
}

function copy(text: string, label = text) {
  navigator.clipboard?.writeText(text).catch(() => {});
  toast(`Copied ${label}`);
}

const SVG_KEY = "colors.svg";
const SVG_ROLES_KEY = "colors.svg-roles";
const saveRoles = () => { try { localStorage.setItem(SVG_ROLES_KEY, JSON.stringify(state.svgRoles)); } catch { /* not stored */ } };

/** a logo-like mark in three colors: the example on the SVG screen, for a look before an SVG of your own */
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="28" fill="#1d4ed8"/>
  <circle cx="60" cy="60" r="34" fill="#fde68a"/>
  <path d="M60 26A34 34 0 0 1 60 94A44 44 0 0 0 60 26Z" fill="#f43f5e"/>
</svg>`;

function useSample() {
  state.svg = analyzeSvg(SAMPLE_SVG);
  state.svgSample = true;
  state.svgRoles = {};
}

function loadSvg(text: string, quiet = false) {
  try {
    state.svg = analyzeSvg(text);
  } catch {
    if (!quiet) toast("That is not an SVG");
    return;
  }
  state.svgSample = false;
  state.svgRoles = {};
  saveRoles();
  try { localStorage.setItem(SVG_KEY, text); } catch { /* not stored, still shown */ }
  if (quiet) return;
  state.show = "svg";
  toast(`SVG with ${state.svg.colors.length} colors`);
  render();
}

function svgAction(action: string) {
  const e = current();
  if (action === "open") document.querySelector<HTMLDialogElement>(".svg-dialog")!.showModal();
  else if (action === "sample") { useSample(); state.show = "svg"; render(); }
  else if (action === "remove") {
    state.svg = null;
    state.svgSample = false;
    try { localStorage.removeItem(SVG_KEY); } catch { /* nothing stored */ }
    render();
  } else if (action === "copy") copy(recolored(e), "SVG");
  else if (action === "download") {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([recolored(e)], { type: "image/svg+xml" })), download: `${e.name.replace(/[^\w&]+/g, "-")}.svg` });
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

/**
 * Swiping through the feed: the track follows the finger, and past a
 * threshold it slides on to the next (or previous) palette. The wheel and
 * the arrow keys do the same with a short animation.
 */
function swipe() {
  const main = document.querySelector("main")!;
  let startY = 0, dy = 0, dragging = false, moving = false, pointerId = -1;
  const track = () => main.querySelector<HTMLElement>(".feed:not(.still) .track");

  const settle = (dir: 1 | -1 | 0) => {
    const t = track();
    if (!t) return;
    const canGo = dir === 1 || (dir === -1 && prevEntry() !== null);
    if (!dir || !canGo) {
      t.style.transition = "transform .3s cubic-bezier(.2,.7,.2,1)";
      t.style.transform = "";
      t.addEventListener("transitionend", () => { t.style.transition = ""; }, { once: true });
      return;
    }
    moving = true;
    t.style.transition = "transform .38s cubic-bezier(.2,.7,.2,1)";
    t.style.transform = `translateY(${dir === 1 ? -100 : 100}%)`;
    const done = () => { moving = false; dir === 1 ? goNext() : goPrev(); };
    t.addEventListener("transitionend", done, { once: true });
    // if the transition never fires (hidden tab), still move on
    setTimeout(() => { if (moving) { t.removeEventListener("transitionend", done); done(); } }, 500);
  };
  const go = (dir: 1 | -1) => { if (!moving && state.view === "feed" && track()) settle(dir); };

  main.addEventListener("pointerdown", (ev) => {
    if (moving || ev.button !== 0 || !track()) return;
    if ((ev.target as HTMLElement).closest("button,select,a,input,textarea")) return;
    pointerId = ev.pointerId;
    startY = ev.clientY;
    dy = 0;
    dragging = false;
  });
  main.addEventListener("pointermove", (ev) => {
    if (ev.pointerId !== pointerId || moving) return;
    const t = track();
    if (!t) return;
    dy = ev.clientY - startY;
    if (!dragging && Math.abs(dy) < 8) return;
    if (!dragging) { dragging = true; main.setPointerCapture(pointerId); }
    // nothing above the first palette: resist
    const y = dy > 0 && !prevEntry() ? dy * 0.3 : dy;
    t.style.transform = `translateY(${y}px)`;
  });
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    pointerId = -1;
    if (!dragging) return;
    dragging = false;
    const h = main.clientHeight;
    settle(Math.abs(dy) > Math.min(80, h * 0.15) ? (dy < 0 ? 1 : -1) : 0);
  };
  main.addEventListener("pointerup", end);
  main.addEventListener("pointercancel", end);

  let wheelAcc = 0, wheelLock = 0;
  main.addEventListener("wheel", (ev) => {
    if (!track()) return;
    ev.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;
    wheelAcc += ev.deltaY;
    if (Math.abs(wheelAcc) < 60) return;
    const dir = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    wheelLock = now + 700;
    go(dir);
  }, { passive: false });

  (swipe as { go?: (dir: 1 | -1) => void }).go = go;
}

const feedGo = (dir: 1 | -1) => (swipe as { go?: (dir: 1 | -1) => void }).go?.(dir);

document.addEventListener("click", (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-show],[data-star],[data-copy],[data-lock],[data-action],[data-tab],[data-pick],[data-copy-export],[data-copy-link],[data-svg],[data-svg-alt]");
  if (!t) return;
  const d = t.dataset;
  if (d.show) setShow(d.show as Show);
  else if (d.star) toggleListed(d.star === "current" ? current() : pick(Number(d.star)));
  else if (d.svg) svgAction(d.svg);
  else if (d.svgAlt) setMapping(d.svgAlt.split(",") as SvgTarget[]);
  else if (d.copy) copy(d.copy);
  else if (d.lock) toggleLock(d.lock as Lockable);
  else if (d.action === "settings") toggleSettings();
  else if (d.action === "grid") state.view === "grid" ? (state.view = "feed", render()) : openGrid();
  else if (d.action === "close") { state.view = "feed"; render(); }
  else if (d.action === "fresh") openGrid();
  else if (d.action === "shortlist") { state.gridFrom = "shortlist"; render(); }
  else if (d.action === "newset") newSet();
  else if (d.action === "tour") { toggleSettings(false); if (state.view === "grid") { state.view = "feed"; render(); } tour(); }
  else if (d.tab) { state.tab = d.tab as Tab; render(); }
  else if (d.pick) { const i = Number(d.pick); state.view = "feed"; walkTo(state.gridFrom === "shortlist" ? i : null, pick(i)); }
  else if ("copyLink" in d) copy(location.href, "link");
  else if ("copyExport" in d) copy(exportText(current()), state.tab === "tailwind" ? "Tailwind theme" : state.tab === "scales" ? "CSS" : state.tab.toUpperCase());
});

document.addEventListener("keydown", (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey || (ev.target as HTMLElement).matches("input,textarea,select")) return;
  const k = ev.key.toLowerCase();
  if (k === "escape") {
    if (state.settings) toggleSettings(false);
    else if (state.view === "grid") { state.view = "feed"; render(); }
    else openGrid();
  }
  else if (k === " " || k === "n") { ev.preventDefault(); state.view === "feed" ? feedGo(1) : newSet(); }
  else if (k === "arrowdown" || k === "arrowright") { if (state.view === "feed") { ev.preventDefault(); feedGo(1); } }
  else if (k === "arrowup" || k === "arrowleft") { if (state.view === "feed") { ev.preventDefault(); feedGo(-1); } }
  else if (k === "f" && state.view === "feed") toggleListed(current());
  else if (k === "s") { if (state.view === "grid" && state.gridFrom === "shortlist") { state.view = "feed"; render(); } else { state.view = "grid"; state.gridFrom = "shortlist"; render(); } }
  else if (k === "v") {
    const usable = SHOWS.map(([s]) => s).filter((s) => s !== "details" || !wide());
    setShow(usable[(usable.indexOf(showOf()) + 1) % usable.length]);
  }
  else if (/^[1-5]$/.test(k)) toggleLock(LOCKABLE[Number(k) - 1]);
  else if (k === "c") setColors(((state.colors - 1) % 3 + 2) as ArtColors);
  else if (k === "g") state.view === "grid" ? (state.view = "feed", render()) : openGrid();
});

// an SVG pasted or dropped anywhere
document.addEventListener("paste", async (ev) => {
  if ((ev.target as HTMLElement).matches("input,textarea")) return;
  const file = [...(ev.clipboardData?.files ?? [])].find((f) => f.type === "image/svg+xml");
  const text = file ? await file.text() : ev.clipboardData?.getData("text/plain") ?? "";
  if (/<svg[\s>]/i.test(text)) { ev.preventDefault(); loadSvg(text); }
});
document.addEventListener("dragover", (ev) => ev.preventDefault());
document.addEventListener("drop", async (ev) => {
  const file = [...(ev.dataTransfer?.files ?? [])].find((f) => f.type === "image/svg+xml" || f.name.endsWith(".svg"));
  if (!file) return;
  ev.preventDefault();
  loadSvg(await file.text());
});

let wasWide = false;
// the title is measured for the artwork's place: again once the webfonts are in
document.fonts?.addEventListener("loadingdone", () => { placeArt(); fitUi(); });

// while the window is resized, no transitions: a layout that changes at a breakpoint jumps instead of sliding across
let resizing = 0;
window.addEventListener("resize", () => {
  document.body.classList.add("resizing");
  clearTimeout(resizing);
  resizing = window.setTimeout(() => document.body.classList.remove("resizing"), 200);
  // the page size follows the viewport
  if (state.view === "grid") render();
  fitGrid();
  placeArt();
  fitUi();
  // Details is a screen on a phone and the sidebar on a wide screen
  if (wasWide !== wide()) { wasWide = wide(); render(); }
});

// a link: /p/<key>, or an older one with the key in the hash
const fromUrl = parseLink(keyOfPath(location.pathname) ?? "") ?? readHash();
state.families = fromUrl?.families ?? [];
// without a link: the neon splash on, three colors in the artwork
state.neon = fromUrl?.neon ?? true;
state.colors = fromUrl?.colors ?? 3;
try { state.accessible = fromUrl?.accessible || !!localStorage.getItem(ACCESSIBLE_KEY); } catch { state.accessible = !!fromUrl?.accessible; }
wasWide = wide();
mount();
try {
  const saved = localStorage.getItem(SVG_KEY);
  const roles = localStorage.getItem(SVG_ROLES_KEY);
  if (saved) loadSvg(saved, true);
  const show = localStorage.getItem(SHOW_KEY);
  if (SHOWS.some(([s]) => s === show)) state.show = show as Show;
  if (state.svg && roles) { state.svgRoles = JSON.parse(roles); saveRoles(); }
} catch { /* no storage */ }
await loadNames("/colornames.txt");
loadShortlist();
push(create(fromUrl?.seed ?? randomSeed(), fromUrl?.locks ?? {}, { ...state, mood: fromUrl?.mood }));
// the first visit (not via a link to a palette) starts with the tour
try { if (!fromUrl && !localStorage.getItem(SEEN_KEY)) tour(); } catch { /* no storage */ }
