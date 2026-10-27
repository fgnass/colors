// The details of a palette: the sidebar on a wide screen, a screen of its own on a phone.
import { contrast, cssOklch, toHex, type Lch } from "../core/color.ts";
import { toCss, toJson, toTailwind } from "../core/export.ts";
import { gradientCss } from "../core/gradient.ts";
import { nearestStep, STEPS } from "../core/ramp.ts";
import type { Scales } from "../core/tokens.ts";
import { esc } from "../html.ts";
import { COLOR_ROLES, colorOf, LOCKABLE, ROLE_LABELS, type ColorRole, type Entry, type LockRole } from "./entry.ts";
import { ICONS, lockIcon } from "./icons.ts";
import { starButton, titleHeading } from "./fragments.ts";
import { state, type Tab } from "./state.ts";

/** The WCAG 2 rating of text in a color on a canvas. */
function wcagRating(ratio: number): string {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "no text";
}

function roleRow(e: Entry, role: ColorRole): string {
  const c = colorOf(e, role);
  const hex = toHex(c);
  const lockable = (LOCKABLE as string[]).includes(role);
  const locked = lockable && !!e.locks[role as LockRole];
  // The contrast with the canvas the color sits on: palette colors on the light canvas, each canvas against the other.
  const against = role === "paper" ? "ink" : "paper";
  const ratio = contrast(hex, toHex(e.canvas[against]));
  const rating = wcagRating(ratio);
  const fails = rating === "no text";
  const canvasName = against === "paper" ? "light" : "dark";
  const ratingTitle = `Text in this color on the ${canvasName} canvas (${toHex(e.canvas[against])}): contrast ${ratio.toFixed(1)}:1`;
  const key = LOCKABLE.indexOf(role as LockRole) + 1;
  const lock = lockable
    ? `<button class="lock${locked ? " on" : ""}" data-lock="${role}" title="Lock (${key})" aria-label="Lock ${ROLE_LABELS[role]}">${lockIcon(locked)}</button>`
    : "<span></span>";
  return `<li class="role${lockable ? "" : " derived"}">
    <button class="chip" style="background:${hex}" data-copy="${hex}" aria-label="Copy ${hex}"></button>
    <div class="what"><div class="name">${esc(e.names[role])}</div><div class="label" title="${ratingTitle}">${ROLE_LABELS[role]} <b class="wcag${fails ? " fail" : ""}">${fails ? ICONS.warn : ICONS.check}${rating}</b></div></div>
    <button class="hex" data-copy="${cssOklch(c)}" title="Copy ${cssOklch(c)}">${hex}</button>
    ${lock}
  </li>`;
}

/** The export in the format of the tab; the Scales tab exports CSS. */
export function exportText(e: Entry): string {
  if (state.tab === "tailwind") return toTailwind(e.palette, e.canvas, e.scales, gradientCss(e.gradient));
  if (state.tab === "json") return toJson(e.palette, e.canvas, e.scales, e.themes);
  return toCss(e.palette, e.canvas, e.scales, e.themes, gradientCss(e.gradient));
}

export function exportLabel(): string {
  if (state.tab === "tailwind") return "Tailwind theme";
  if (state.tab === "scales") return "CSS";
  return state.tab.toUpperCase();
}

function scaleRows(e: Entry): string {
  const row = (key: keyof Scales, src?: Lch) => {
    const r = e.scales[key];
    // The step the palette color sits at is marked as its home.
    const home = src ? nearestStep(src) : -1;
    const steps = STEPS.map((s) => {
      const hex = toHex(r[s]);
      return `<button class="${s === home ? "home" : ""}" style="background:${hex}" data-copy="${hex}" title="${key}-${s} ${hex}" aria-label="${key}-${s} ${hex}"></button>`;
    });
    return `<div class="scale">${steps.join("")}</div>`;
  };
  const rows =
    row("main", e.palette.main) +
    row("companion", e.palette.companion) +
    row("anchor", e.palette.anchor) +
    row("neutral");
  return `<div class="scales">${rows}
    <div class="steps">${STEPS.map((s) => `<span>${s}</span>`).join("")}</div></div>`;
}

const TABS: [Tab, string][] = [
  ["scales", "Scales"],
  ["css", "CSS"],
  ["tailwind", "Tailwind"],
  ["json", "JSON"],
];

export function details(e: Entry): string {
  const tabs = TABS.map(
    ([id, label]) => `<button class="${state.tab === id ? "on" : ""}" data-tab="${id}">${label}</button>`,
  ).join("");
  const locks = Object.keys(e.locks) as ColorRole[];
  const lockNote = locks.length ? `<div class="meta">${locks.map((l) => ROLE_LABELS[l]).join(" + ")} locked</div>` : "";
  const panel = state.tab === "scales" ? scaleRows(e) : `<pre>${esc(exportText(e))}</pre>`;
  return `<div class="d-head">
      <div class="d-title"><h2>${titleHeading(e.name)}</h2>
        ${lockNote}</div>
      ${starButton(e)}
    </div>
    <ul class="roles">${COLOR_ROLES.map((r) => roleRow(e, r)).join("")}</ul>
    <div class="tabs">${tabs}
      <button class="copy" data-copy-export title="Copy ${state.tab === "scales" ? "CSS" : state.tab}">Copy</button></div>
    <div class="panel">${panel}</div>
    <div class="dl"><div class="label">Share</div>
      <div class="btns"><button class="act ghost" data-copy-link>Copy link</button></div></div>`;
}
