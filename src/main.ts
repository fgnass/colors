// The app: the chrome is mounted once, every change of state renders the
// view again, and the event handlers map the controls to the actions below.
import "@fontsource-variable/piazzolla/opsz.css";
import "@fontsource-variable/piazzolla/opsz-italic.css";
import "@fontsource-variable/instrument-sans/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./style.css";

import type { ArtColors } from "./art.ts";
import { loadNames } from "./core/names.ts";
import { randomSeed } from "./core/random.ts";
import { keyOfPath, parseLink } from "./link.ts";
import { endTour, startTour, tourActive, type TourHost } from "./tour.ts";

import { chromeHtml } from "./app/chrome.ts";
import { copyText } from "./app/clipboard.ts";
import { exportLabel, exportText } from "./app/details.ts";
import { LOCKABLE, type ColorRole, type Entry, type LockRole } from "./app/entry.ts";
import { goNext, goPrev, prevEntry, remake, toggleLock, walkTo } from "./app/feed.ts";
import { hasPreviousPage, newSet, openGrid, pageIndices, paged, pick, turnPage } from "./app/grid.ts";
import { fitUi, isWide, modeInEffect, placeArt } from "./app/layout.ts";
import { render } from "./app/render.ts";
import { loadShortlist, remakeShortlist, toggleShortlist } from "./app/shortlist.ts";
import { current, isMode, makeEntry, MODES, state, type Mode, type Tab } from "./app/state.ts";
import { parseLegacyKey, readStored, writeStored } from "./app/storage.ts";
import { attachSwipe } from "./app/swipe.ts";
import { loadSvg, recolored, removeSvg, restoreSvg, setMapping, useSample } from "./app/svgArt.ts";
import { toast } from "./app/toast.ts";

const MODE_KEY = "colors.show";
const ACCESSIBLE_KEY = "colors.accessible";
const SEEN_KEY = "colors.seen";

// ---------- actions ----------

function setMode(m: Mode) {
  state.mode = m;
  writeStored(MODE_KEY, m);
  render();
}

/** The next mode on the V key: SVG always, Details only on a phone. */
function cycleMode() {
  const usable = MODES.map(([m]) => m).filter((m) => m !== "details" || !isWide());
  setMode(usable[(usable.indexOf(modeInEffect()) + 1) % usable.length]);
}

function setView(view: "feed" | "grid") {
  if (view === "grid") openGrid();
  else state.view = "feed";
  render();
}

function showShortlist() {
  state.view = "grid";
  state.gridFrom = "shortlist";
  render();
}

function toggleGrid() {
  setView(state.view === "grid" ? "feed" : "grid");
}

function star(e: Entry) {
  const change = toggleShortlist(e);
  toast(change === "added" ? "Added to the shortlist" : "Removed from the shortlist");
  render();
}

/** The current palette, or the palettes of the grid's page that are not on the shortlist. */
const affected = () => (state.view === "grid" ? pageIndices() : [state.index]);

/**
 * Up to two hue families. Clicking a hue adds it. Clicking the only one again
 * makes it monochrome, a third click removes it. A third hue replaces the older one.
 */
function pickFamily(f: string | undefined) {
  const sel = state.families;
  if (!f) return setFamilies([]);
  const n = sel.filter((x) => x === f).length;
  if (n === 2) return setFamilies([]);
  if (n === 1) return setFamilies(sel.length === 1 ? [f, f] : sel.filter((x) => x !== f));
  setFamilies(sel.length < 2 ? [...sel, f] : [sel[1] === sel[0] ? sel[0] : sel[1], f]);
}

/** The same seeds with the hue families: the current palette, or the grid's new ones. */
function setFamilies(families: string[]) {
  state.families = families;
  remake(affected(), { families });
  render();
}

function setNeon(neon: boolean) {
  state.neon = neon;
  remake(affected(), { neon });
  render();
}

/** The same palettes, with interface tokens that pass WCAG AA or as they are. The feed's palettes are remade as they come up. */
function setAccessible(on: boolean) {
  state.accessible = on;
  state.next = null;
  remakeShortlist();
  writeStored(ACCESSIBLE_KEY, on ? "1" : "");
  render();
}

/** The same palettes, with the artwork in n colors. The feed's palettes are remade as they come up. */
function setColors(n: ArtColors) {
  state.colors = n;
  state.next = null;
  remakeShortlist();
  render();
}

function toggleSettings(open = !state.settings) {
  state.settings = open;
  document.body.classList.toggle("settings-open", open);
  document.querySelector("[data-action=settings]")!.classList.toggle("on", open);
}

function copy(text: string, label = text) {
  void copyText(text, label, toast);
}

/** Shares the palette's link through the system's share sheet, or copies it where there is none. */
function shareLink() {
  const url = location.href;
  if (!navigator.share) return copy(url, "link");
  navigator.share({ title: document.title, url }).catch((err: unknown) => {
    if ((err as Error).name !== "AbortError") copy(url, "link");
  });
}

/** The tour in the live app: a line of hints, one thing to try at a time, until all was tried. */
function tour() {
  toggleSettings(false);
  if (state.view === "grid") setView("feed");
  if (tourActive()) return endTour();
  writeStored(SEEN_KEY, "1");
  const host: TourHost = {
    wide: isWide,
    probe: () => ({
      index: state.index,
      mode: state.mode,
      settings: state.settings,
      svg: !!state.svg,
      view: state.view,
      from: state.gridFrom,
      listed: state.shortlist.length,
    }),
    // The tour starts on one palette, with the shapes.
    feed: () => {
      if (state.view !== "feed" || state.mode !== "shapes") {
        state.view = "feed";
        state.mode = "shapes";
        render();
      }
    },
  };
  startTour(host);
}

// ---------- your SVG ----------

async function importSvg(text: string) {
  const result = await loadSvg(text);
  if (result === "failed") toast("Could not read that SVG");
  if (result !== "loaded") return;
  state.mode = "svg";
  const n = state.svg!.colors.length;
  toast(`SVG with ${n} ${n === 1 ? "color" : "colors"}`);
  render();
}

function downloadSvg(e: Entry) {
  const blob = new Blob([recolored(e)], { type: "image/svg+xml" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `${e.name.replace(/[^\w&]+/g, "-")}.svg`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function svgAction(action: string) {
  const e = current();
  switch (action) {
    case "open":
      document.querySelector<HTMLDialogElement>(".svg-dialog")!.showModal();
      break;
    case "sample":
      await useSample();
      state.mode = "svg";
      render();
      break;
    case "remove":
      removeSvg();
      render();
      break;
    case "copy":
      copy(recolored(e), "SVG");
      break;
    case "download":
      downloadSvg(e);
      break;
  }
}

// ---------- the chrome ----------

let feedGo: (direction: 1 | -1) => void = () => {};

function mount() {
  document.querySelector("#app")!.innerHTML = chromeHtml();
  const dialog = document.querySelector<HTMLDialogElement>(".svg-dialog")!;
  dialog.addEventListener("close", () => {
    const code = dialog.querySelector("textarea")!;
    if (dialog.returnValue === "use" && code.value.trim()) importSvg(code.value);
    code.value = "";
  });
  dialog.querySelector<HTMLInputElement>("input[type=file]")!.addEventListener("change", async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) {
      dialog.close();
      importSvg(await file.text());
    }
  });
  document
    .querySelectorAll<HTMLElement>("[data-colors]")
    .forEach((b) => b.addEventListener("click", () => setColors(Number(b.dataset.colors) as ArtColors)));
  document
    .querySelectorAll<HTMLElement>("[data-family]")
    .forEach((b) => b.addEventListener("click", () => pickFamily(b.dataset.family || undefined)));
  const checkbox = (id: string, onChange: (checked: boolean) => void) =>
    document
      .querySelector<HTMLInputElement>(id)!
      .addEventListener("change", (ev) => onChange((ev.target as HTMLInputElement).checked));
  checkbox("#neon", setNeon);
  checkbox("#accessible", setAccessible);
  // The feed moves a palette at a time, the grid a page at a time.
  feedGo = attachSwipe(document.querySelector("main")!, {
    enabled: () => state.view === "feed" || paged(),
    hasPrevious: () => (state.view === "grid" ? hasPreviousPage() : prevEntry() !== null),
    move: (direction) => {
      if (state.view === "grid") turnPage(direction);
      else if (direction === 1) goNext();
      else goPrev();
      render();
    },
  });
}

// ---------- events ----------

const ACTIONABLE =
  "[data-mode],[data-star],[data-copy],[data-lock],[data-action],[data-tab],[data-pick],[data-copy-export],[data-share],[data-svg],[data-svg-alt]";

function onAction(action: string) {
  switch (action) {
    case "settings":
      return toggleSettings();
    case "grid":
      return toggleGrid();
    case "close":
      return setView("feed");
    case "fresh":
      return setView("grid");
    case "shortlist":
      return showShortlist();
    case "newset":
      newSet();
      return render();
    case "tour":
      return tour();
  }
}

document.addEventListener("click", (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>(ACTIONABLE);
  if (!t) return;
  const d = t.dataset;
  if (d.mode) setMode(d.mode as Mode);
  else if (d.star) star(d.star === "current" ? current() : pick(Number(d.star)));
  else if (d.svg) svgAction(d.svg);
  else if (d.svgAlt) {
    setMapping(d.svgAlt.split(",") as ColorRole[]);
    render();
  } else if (d.copy) copy(d.copy);
  else if (d.lock) {
    toggleLock(d.lock as LockRole);
    render();
  } else if (d.action) onAction(d.action);
  else if (d.tab) {
    state.tab = d.tab as Tab;
    render();
  } else if (d.pick) {
    const i = Number(d.pick);
    state.view = "feed";
    walkTo(state.gridFrom === "shortlist" ? i : null, pick(i));
    render();
  } else if ("share" in d) shareLink();
  else if ("copyExport" in d) copy(exportText(current()), exportLabel());
});

function onKey(ev: KeyboardEvent) {
  const k = ev.key.toLowerCase();
  const inFeed = state.view === "feed";
  const swipes = inFeed || paged();
  if (k === "escape") {
    if (state.settings) toggleSettings(false);
    else toggleGrid();
  } else if (k === " " || k === "n") {
    ev.preventDefault();
    if (inFeed) feedGo(1);
    else {
      newSet();
      render();
    }
  } else if ((k === "arrowdown" || k === "arrowright" || k === "pagedown") && swipes) {
    ev.preventDefault();
    feedGo(1);
  } else if ((k === "arrowup" || k === "arrowleft" || k === "pageup") && swipes) {
    ev.preventDefault();
    feedGo(-1);
  } else if (k === "f" && inFeed) star(current());
  else if (k === "s") {
    if (state.view === "grid" && state.gridFrom === "shortlist") setView("feed");
    else showShortlist();
  } else if (k === "v") cycleMode();
  else if (/^[1-5]$/.test(k)) {
    toggleLock(LOCKABLE[Number(k) - 1]);
    render();
  } else if (k === "c") setColors((((state.colors - 1) % 3) + 2) as ArtColors);
  else if (k === "g") toggleGrid();
}

document.addEventListener("keydown", (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey || (ev.target as HTMLElement).matches("input,textarea,select")) return;
  onKey(ev);
});

// An SVG pasted or dropped anywhere.
document.addEventListener("paste", async (ev) => {
  if ((ev.target as HTMLElement).matches("input,textarea")) return;
  const file = [...(ev.clipboardData?.files ?? [])].find((f) => f.type === "image/svg+xml");
  const text = file ? await file.text() : (ev.clipboardData?.getData("text/plain") ?? "");
  if (/<svg[\s>]/i.test(text)) {
    ev.preventDefault();
    importSvg(text);
  }
});
document.addEventListener("dragover", (ev) => ev.preventDefault());
document.addEventListener("drop", async (ev) => {
  const file = [...(ev.dataTransfer?.files ?? [])].find((f) => f.type === "image/svg+xml" || f.name.endsWith(".svg"));
  if (!file) return;
  ev.preventDefault();
  importSvg(await file.text());
});

// The title is measured for the artwork's place: again once the webfonts are in.
document.fonts?.addEventListener("loadingdone", () => {
  placeArt();
  fitUi();
});

let wasWide = false;
let resizing = 0;
window.addEventListener("resize", () => {
  // No transitions while the window is resized: a layout that changes at a breakpoint jumps instead of sliding across.
  document.body.classList.add("resizing");
  clearTimeout(resizing);
  resizing = window.setTimeout(() => document.body.classList.remove("resizing"), 200);
  // The page size follows the viewport.
  if (state.view === "grid") render();
  placeArt();
  fitUi();
  // Details is a screen on a phone and the sidebar on a wide screen.
  if (wasWide !== isWide()) {
    wasWide = isWide();
    render();
  }
});

// ---------- start ----------

// A link: /p/<key>, or an older one with the key in the hash.
const fromUrl = parseLink(keyOfPath(location.pathname) ?? "") ?? parseLegacyKey(location.hash);
state.families = fromUrl?.families ?? [];
// Without a link: the neon splash on, three colors in the artwork.
state.neon = fromUrl?.neon ?? true;
state.colors = fromUrl?.colors ?? 3;
state.accessible = fromUrl ? fromUrl.accessible : !!readStored(ACCESSIBLE_KEY);
wasWide = isWide();
mount();
await restoreSvg();
const storedMode = readStored(MODE_KEY);
if (isMode(storedMode)) state.mode = storedMode;
await loadNames("/colornames.txt");
loadShortlist();
walkTo(null, makeEntry(fromUrl?.seed ?? randomSeed(), fromUrl?.locks ?? {}, { ...state, mood: fromUrl?.mood }));
render();
// The first visit, not via a link to a palette, starts with the tour.
if (!fromUrl && !readStored(SEEN_KEY)) tour();
