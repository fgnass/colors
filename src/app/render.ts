// One render puts the whole view on the page: the feed or the grid, the
// sidebar, and the state of the bar and the settings sheet.
import { toHex, type Lch } from "../core/color.ts";
import { isNeon, ROLES } from "../core/palette.ts";
import { linkKey } from "../link.ts";
import { markSvg, ringColors } from "../mark.ts";
import { details } from "./details.ts";
import type { Entry } from "./entry.ts";
import { fitGrid, gridView } from "./grid.ts";
import { fitUi, isWide, modeInEffect, placeArt } from "./layout.ts";
import { feedView } from "./screens.ts";
import { current, state, type Mode } from "./state.ts";

/** The link to the palette shown. */
function writeLink(e: Entry) {
  history.replaceState(null, "", `/p/${linkKey(e)}`);
}

/** The favicon: the mark in the current palette's colors, on its main. */
function writeIcon(e: Entry) {
  const p = e.palette;
  const main = toHex(p.main);
  const rings = ringColors(main, [p.companion, p.light, p.anchor, p.dark].map(toHex), [
    toHex(e.canvas.ink),
    toHex(e.canvas.paper),
  ]);
  const href = `data:image/svg+xml,${encodeURIComponent(markSvg(rings, main))}`;
  const link = document.querySelector<HTMLLinkElement>("link[rel=icon]")!;
  if (link.href !== href) link.href = href;
}

/** The palette's neon, else its most colorful color: the splash on the settings button. */
function neonOf(e: Entry): Lch {
  const colors = ROLES.map((r) => e.palette[r]);
  return colors.find(isNeon) ?? colors.reduce((a, b) => (b.c > a.c ? b : a));
}

function renderBar() {
  const mode = modeInEffect();
  document.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) => {
    const m = b.dataset.mode as Mode;
    b.classList.toggle("on", m === mode || (m === "details" && state.mode === "details" && !isWide()));
  });
  document.querySelector("[data-action=grid]")!.classList.toggle("on", state.view === "grid");
  const settings = document.querySelector<HTMLElement>("[data-action=settings]")!;
  settings.classList.toggle("on", state.settings);
  settings.classList.toggle("neon", state.neon);
}

function renderSettings() {
  document.querySelector<HTMLInputElement>("#neon")!.checked = state.neon;
  document.querySelector<HTMLInputElement>("#accessible")!.checked = state.accessible;
  document.querySelectorAll<HTMLElement>("[data-family]").forEach((b) => {
    const n = state.families.filter((f) => f === b.dataset.family).length;
    b.classList.toggle("on", b.dataset.family ? n > 0 : !state.families.length);
    b.classList.toggle("twice", n === 2);
  });
  document
    .querySelectorAll<HTMLElement>("[data-colors]")
    .forEach((b) => b.classList.toggle("on", Number(b.dataset.colors) === state.colors));
}

export function render() {
  const e = current();
  document.body.classList.toggle("grid", state.view === "grid");
  document.body.classList.toggle("settings-open", state.settings);
  if (state.view === "feed") {
    writeLink(e);
    writeIcon(e);
    document.title = `${e.name} — Colors`;
  }
  document.querySelector("main")!.innerHTML = state.view === "grid" ? gridView() : feedView();
  document.querySelector(".side")!.innerHTML = details(e);
  placeArt();
  fitUi();
  renderBar();
  document.body.style.setProperty("--neon", toHex(neonOf(e)));
  // The wordmark takes the text color of the screen under it. The palette's number sits where the wordmark does.
  const under =
    document.querySelector<HTMLElement>(".slot.cur .no") ?? document.querySelector<HTMLElement>(".slot.cur .screen");
  if (under) document.body.style.setProperty("--wordmark", getComputedStyle(under).color);
  fitGrid();
  // The single palette shows its own settings, and new palettes are made with them.
  if (state.view === "feed") {
    state.families = e.families;
    state.neon = e.neon;
  }
  renderSettings();
}
