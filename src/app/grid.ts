// The grid: the feed a page at a time, or the shortlist.
import { randomSeed } from "../core/random.ts";
import { toHex } from "../core/color.ts";
import type { Entry } from "./entry.ts";
import { typeOn, typeOnGradient } from "./fragments.ts";
import { ICONS, STAR } from "./icons.ts";
import { modeInEffect } from "./layout.ts";
import { svgPrompt, tileArt } from "./screens.ts";
import { onShortlist } from "./shortlist.ts";
import { current, entryAt, identityOf, makeEntry, state } from "./state.ts";

const GRID_GAP = 20;
const PHONE_WIDTH = 700;
const TILE_MIN = 150;
const TILE_ASPECT = 5 / 4;
/** The tiles should cover this share of the room. */
const COVER_ENOUGH = 0.75;

interface GridLayout {
  cols: number;
  rows: number;
  size: number;
}

/**
 * The grid with the most tiles that still read (TILE_MIN wide) and cover
 * three quarters of the viewport, else the one that covers the most of it.
 * On a phone: two columns of six, scrolling.
 */
export function gridLayout(): GridLayout {
  const pad = window.innerWidth > PHONE_WIDTH ? 40 : 16;
  const w = Math.min(window.innerWidth, 1600) - pad * 2;
  if (window.innerWidth <= PHONE_WIDTH) return { cols: 2, rows: 6, size: (w - GRID_GAP) / 2 };
  const top = 28 + 40 + 16;
  const bottom = 48 + 48;
  // The tour's line of hints takes room at the bottom.
  const tourHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tour")) || 0;
  const h = window.innerHeight - tourHeight - top - bottom;
  let bestFit = { cols: 2, rows: 1, size: (w - GRID_GAP) / 2, cover: 0 };
  for (let rows = 1; rows <= 8; rows++) {
    for (let cols = 1; cols <= 16; cols++) {
      const size = Math.min((w - GRID_GAP * (cols - 1)) / cols, ((h + GRID_GAP) / rows - GRID_GAP) / TILE_ASPECT);
      if (size < TILE_MIN) break;
      const cover = (cols * rows * size * size * TILE_ASPECT) / (w * h);
      const better =
        bestFit.cover < COVER_ENOUGH
          ? cover > bestFit.cover
          : cover >= COVER_ENOUGH && cols * rows > bestFit.cols * bestFit.rows;
      if (better) bestFit = { cols, rows, size, cover };
    }
  }
  return bestFit;
}

/** The grid's page: as many palettes as fill the viewport. */
export const pageSize = () => {
  const l = gridLayout();
  return l.cols * l.rows;
};

export function fitGrid() {
  const el = document.querySelector<HTMLElement>(".wall");
  if (!el) return;
  const l = gridLayout();
  el.style.gridTemplateColumns =
    window.innerWidth <= PHONE_WIDTH ? "repeat(2, 1fr)" : `repeat(${l.cols}, ${Math.floor(l.size)}px)`;
}

/** The feed filled with new palettes up to n, made with the current palette's locks. */
function extendFeed(n: number) {
  const base = current();
  while (state.history.length < n) state.history.push(makeEntry(randomSeed(), base.locks, state));
}

/** The page of the feed the current palette is on, filled up so it is full. */
export function fillPage(): { start: number; entries: Entry[] } {
  const n = pageSize();
  const start = Math.floor(state.index / n) * n;
  extendFeed(start + n);
  return { start, entries: Array.from({ length: n }, (_, i) => entryAt(start + i)) };
}

/** The indices of the page's palettes that are not on the shortlist. */
export const pageIndices = () => {
  const { start, entries } = fillPage();
  return entries.map((e, i) => (onShortlist(e) ? -1 : start + i)).filter((i) => i >= 0);
};

export function openGrid() {
  state.view = "grid";
  state.shortlistCursor = null;
  state.gridFrom = "fresh";
}

/** A page of new palettes after the end of the feed. */
export function newSet() {
  const n = pageSize();
  const start = Math.ceil(state.history.length / n) * n;
  extendFeed(start + n);
  state.index = start;
  state.next = null;
  openGrid();
}

/** The palette of a tile. */
export function pick(i: number): Entry {
  return state.gridFrom === "shortlist" ? state.shortlist[i] : state.history[fillPage().start + i];
}

/** The text color of a tile, for the star on it. */
function tileInk(e: Entry): string {
  switch (modeInEffect()) {
    case "gradient":
      return typeOnGradient(e, e.gradient.top);
    case "light":
      return e.themes.light.text;
    case "dark":
      return e.themes.dark.text;
    case "svg":
      if (state.svg) return toHex(e.canvas.ink);
      return typeOn(e, e.palette.main, 4.5);
    default:
      return typeOn(e, e.palette.main, 4.5);
  }
}

function tile(e: Entry, i: number, cur: string): string {
  const classes = `item${onShortlist(e) ? " listed" : ""}${identityOf(e) === cur ? " cur" : ""}`;
  const star = `<button class="star${onShortlist(e) ? " on" : ""}" data-star="${i}" style="color:${tileInk(e)}" title="Shortlist" aria-label="Shortlist">${STAR}</button>`;
  return `<div class="${classes}" data-pick="${i}">${tileArt(e)}
        ${star}</div>`;
}

function wall(): string {
  if (modeInEffect() === "svg" && !state.svg) return `<div class="wall-prompt">${svgPrompt()}</div>`;
  const entries = state.gridFrom === "shortlist" ? state.shortlist : fillPage().entries;
  if (!entries.length) {
    return `<div class="empty">No palettes on the shortlist yet. Star the ones you like (<kbd>F</kbd> or the star on a tile), and they stay when you generate new ones.</div>`;
  }
  const cur = identityOf(current());
  return `<div class="wall">${entries.map((e, i) => tile(e, i, cur)).join("")}</div>`;
}

export function gridView(): string {
  const on = (from: typeof state.gridFrom) => (state.gridFrom === from ? "on" : "");
  const pageNo = fillPage().start / pageSize() + 1;
  return `<div class="grid-view">
    <div class="grid-head">
      <div class="seg" role="group" aria-label="Which palettes">
        <button class="${on("fresh")}" data-action="fresh">Fresh</button>
        <button class="${on("shortlist")}" data-action="shortlist">Shortlist <output>${state.shortlist.length || ""}</output> <kbd class="hide-s">S</kbd></button>
      </div>
      <div class="spacer"></div>
      <output class="page hide-s" title="Page of the feed">Page ${pageNo}</output>
      <button class="round hide-l" data-action="newset" title="New set (Space)" aria-label="New set">${ICONS.refresh}</button>
      <button class="round" data-action="tour" title="The tour" aria-label="The tour">${ICONS.help}</button>
      <button class="round" data-action="close" title="Back (Esc)" aria-label="Close grid">${ICONS.close}</button>
    </div>
    ${wall()}
  </div>`;
}
