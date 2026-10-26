// The tour: a line at the bottom, above the bar, that suggests one thing to try, with a ring on the
// control for it, and nothing else. The line types itself out, like a game that talks to you. Everything stays usable; whatever is tried counts, in any order. Once all is
// tried, the line says so and goes away.

/** what the tour sees of the app */
export type Probe = { index: number; show: string; settings: boolean; svg: boolean; view: string; from: string; listed: number };
type Item = {
  hint: string;
  /** the control to try, ringed while the item is up */
  at?: string;
  done: (p: Probe, seen: Seen) => boolean;
};
/** what was seen since the tour began */
type Seen = { indices: Set<number>; shows: Set<string>; settings: boolean; settingsClosed: boolean; shortlist: boolean };

/** what the tour may do with the app, and see of it */
export interface TourHost {
  wide(): boolean;
  probe(): Probe;
  /** the feed, with the shapes */
  feed(): void;
}

function items(h: TourHost): Item[] {
  const w = h.wide();
  const details = { hint: "The list icon shows the palette in detail: every color with its role, the scales, and the export as CSS or Tailwind.", at: "[data-show=details]", done: (p: Probe, s: Seen) => s.shows.has("details") };
  return [
    { hint: `Welcome to Colors. Every screen is a color palette, shown on a set of shapes. ${w ? "Scroll down" : "Swipe up"} to see the next one.`, done: (p, s) => s.indices.size >= 2 },
    { hint: "Click the dotted icon to see the same palette as a gradient.", at: "[data-show=gradient]", done: (p, s) => s.shows.has("gradient") },
    { hint: "Browse some gradients, then click the sun icon to see how the palette would look in a light UI theme.", at: "[data-show=light]", done: (p, s) => s.shows.has("light") },
    { hint: "This is a small app mockup in the palette's colors. Click the moon icon for the dark theme.", at: "[data-show=dark]", done: (p, s) => s.shows.has("dark") },
    { hint: "Click the picture icon to try the palettes on your own artwork.", at: "[data-show=svg]", done: (p, s) => s.shows.has("svg") },
    { hint: "Paste or drop an SVG, choose a file, or just use the example.", at: ".slot.cur [data-svg=sample]", done: (p) => p.svg },
    ...(w ? [] : [details]),
    { hint: "Now open the settings with the swatch icon.", at: "[data-action=settings]", done: (p, s) => s.settings },
    { hint: "Here you can turn the neon splash on or off, limit the palettes to one or two hues, or change the number of colors in the artwork. Close the settings when you are done.", done: (p, s) => s.settingsClosed },
    { hint: "The grid icon shows all the palettes you have seen, a page at a time.", at: "[data-action=grid]", done: (p) => p.view === "grid" },
    { hint: "Star the palettes you like: they stay on your shortlist, even when you generate new ones.", at: "[data-action=shortlist]", done: (p, s) => s.shortlist },
  ];
}

let active: { end: () => void } | null = null;
export const tourActive = () => active !== null;

export function endTour() {
  active?.end();
}

export function startTour(host: TourHost) {
  if (active) return;
  const bar = document.createElement("div");
  bar.className = "tour";
  document.body.append(bar);
  document.body.classList.add("tour-on");
  host.feed();
  const first = host.probe();
  const seen: Seen = { indices: new Set([first.index]), shows: new Set([first.show]), settings: first.settings, settingsClosed: false, shortlist: false };
  const all = items(host);
  let current: Item | null = null;
  let typing = 0;

  /** the line types itself out; the whole text holds the room from the start, so nothing moves */
  function type(text: string, more = "") {
    clearTimeout(typing);
    bar.innerHTML = `<p><span class="whole">${text}</span><span class="typed"></span></p>${more}`;
    const typed = bar.querySelector<HTMLElement>(".typed")!;
    let n = 0;
    const step = () => {
      n++;
      typed.textContent = text.slice(0, n);
      if (n < text.length) typing = window.setTimeout(step, /[.,:!?]/.test(text[n - 1]) ? 220 : 24);
    };
    typing = window.setTimeout(step, 150);
  }

  const lit = (el: Element | null) => {
    document.querySelectorAll(".hot").forEach((e) => e.classList.remove("hot"));
    el?.classList.add("hot");
  };

  /** the first thing not yet tried: its hint typed out, its control ringed */
  function update() {
    const p = host.probe();
    seen.indices.add(p.index);
    seen.shows.add(p.show);
    if (p.settings) seen.settings = true;
    else if (seen.settings) seen.settingsClosed = true;
    if (p.from === "shortlist" || p.listed > 0) seen.shortlist = true;
    const next = all.find((it) => !it.done(p, seen)) ?? null;
    document.documentElement.style.setProperty("--tour", `${bar.offsetHeight}px`);
    // the ring again after every render: the control may have been drawn anew
    lit(next?.at ? document.querySelector(next.at) : null);
    if (next === current) return;
    current = next;
    if (current === null && !next) return;
    if (!next) {
      // all tried: a last line that stays until it is closed, or until the next thing is done in the app
      type("That's it. To see these hints again, use the ? button in the grid.",
        `<button class="act ghost end" data-tour="end" title="Close (Esc)">Close</button>`);
      return;
    }
    type(next.hint, `<button class="act ghost end" data-tour="end" title="End the tour (Esc)">End tour</button>`);
    document.documentElement.style.setProperty("--tour", `${bar.offsetHeight}px`);
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    end();
    ev.preventDefault();
    ev.stopPropagation();
  };
  const onResize = () => document.documentElement.style.setProperty("--tour", `${bar.offsetHeight}px`);
  const onClick = (ev: Event) => { if ((ev.target as HTMLElement).closest("[data-tour=end]")) end(); };
  const observer = new MutationObserver(() => {
    if (!active) return;
    // after the last line, any use of the app ends the tour
    if (current === null && all.every((it) => it.done(host.probe(), seen))) return end();
    update();
  });

  function end() {
    if (!active) return;
    active = null;
    clearTimeout(typing);
    observer.disconnect();
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    lit(null);
    bar.remove();
    document.body.classList.remove("tour-on");
    document.documentElement.style.removeProperty("--tour");
    // the app takes its full height again
    window.dispatchEvent(new Event("resize"));
  }

  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  bar.addEventListener("click", onClick);
  observer.observe(document.querySelector("main")!, { childList: true });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  active = { end };
  update();
  // the art is placed for the screen's height: again now that the hint line took its room at the bottom
  window.dispatchEvent(new Event("resize"));
}
