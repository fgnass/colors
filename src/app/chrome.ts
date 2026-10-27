// The chrome, rendered once: the bar, the sidebar, the settings sheet and the SVG dialog.
import { toGamut, toHex } from "../core/color.ts";
import { HUE_FAMILIES } from "../core/palette.ts";
import { ICONS } from "./icons.ts";
import { MODES } from "./state.ts";

const NEON_SPLASH = `<svg class="neon-splash" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.6c1.5-.4 2 1.6 3.3 2.2 1.4.6 3.4-.4 4 1 .6 1.5-1.3 2.4-1.2 3.9.1 1.4 2.2 2.4 1.5 3.8-.7 1.4-2.8.6-4 1.5-1.2.9-1.2 3.1-2.8 3.2-1.5.1-1.8-2-3-2.9-1.2-.9-3.4-.5-3.9-2-.5-1.4 1.5-2.3 1.5-3.7 0-1.5-1.9-2.6-1.2-3.9.7-1.4 2.8-.4 4-1.2.8-.6 1-1.7 1.8-1.9Z"/><circle cx="20.2" cy="4.6" r="1.5"/><circle cx="3.6" cy="4.2" r="1.1"/><circle cx="21" cy="19.6" r="1.1"/><circle cx="4.4" cy="20.6" r="1.4"/></svg>`;

const REPO_URL = "https://github.com/fgnass/colors";
const PRIVACY_URL = "https://gnass.buzz/privacy";

const capitalized = (s: string) => s[0].toUpperCase() + s.slice(1);

function modeButtons(): string {
  return MODES.map(
    ([m, label]) =>
      `<button data-mode="${m}" class="${m === "details" ? "hide-l" : ""}" title="${label} (V)" aria-label="${label}">${ICONS[m]}</button>`,
  ).join("");
}

function familyButtons(): string {
  const dot = (hue: number) => toHex(toGamut({ l: 0.7, c: 0.15, h: hue }));
  const buttons = HUE_FAMILIES.map(
    (f) =>
      `<button data-family="${f.name}" title="${capitalized(f.name)}" aria-label="${f.name}" style="--dot:${dot(f.hue)}"></button>`,
  );
  return `<button data-family="" class="any" title="Any hue">Any</button>${buttons.join("")}`;
}

function settingsSheet(): string {
  return `<section class="settings" aria-label="Settings">
      <div class="handle"></div>
      <div class="field hues-field">
        <div class="label">Hue family</div>
        <div class="hues" role="group" aria-label="Hue families" title="Hues the palettes must contain, in any role. Tap a second hue for two; tap a hue twice for a monochrome palette.">
          ${familyButtons()}
        </div>
        <div class="hint">Tap a second hue for two, twice for monochrome.</div>
      </div>
      <div class="field row colors-field">
        <div><div class="label">Colors</div><div class="hint">In the artwork, background included (C)</div></div>
        <div class="seg" role="group" aria-label="Colors in the artwork">${[2, 3, 4].map((n) => `<button data-colors="${n}">${n}</button>`).join("")}</div>
      </div>
      <label class="field row neon-field">
        <div><div class="label">Neon splash ${NEON_SPLASH}</div><div class="hint">The palette as it is, the color closest to a neon made neon</div></div>
        <input id="neon" type="checkbox"><span class="switch"></span>
      </label>
      <label class="field row accessible-field">
        <div><div class="label">Accessible tokens</div><div class="hint">Interface colors pass WCAG AA in light and dark mode; the palette stays as it is</div></div>
        <input id="accessible" type="checkbox"><span class="switch"></span>
      </label>
      <div class="about">
        <a href="${REPO_URL}" target="_blank" rel="noopener">Source on GitHub</a>
        <a href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy</a>
      </div>
    </section>`;
}

function svgDialog(): string {
  return `<dialog class="svg-dialog"><form method="dialog">
      <h2>Your SVG</h2>
      <p>Paste the SVG code, or choose a file. You can also paste (<kbd>⌘V</kbd>) or drop an SVG anywhere on the page.</p>
      <textarea name="code" spellcheck="false" placeholder="<svg …>"></textarea>
      <div class="row"><label class="act ghost">Choose file<input type="file" accept=".svg,image/svg+xml" hidden></label><span class="spacer"></span>
        <button class="act ghost" value="cancel">Cancel</button><button class="act primary" value="use">Use</button></div>
    </form></dialog>`;
}

export function chromeHtml(): string {
  return `
    <button class="wordmark" data-action="tour" title="Colors: the tour">Colors</button>
    <main></main>
    <aside class="side" aria-label="Palette details"></aside>
    <nav class="bar">
      <div class="show" role="group" aria-label="Show">${modeButtons()}</div>
      <button class="round" data-action="settings" title="Settings" aria-label="Settings">${ICONS.settings}</button>
      <button class="newset" data-action="newset">New set <kbd>Space</kbd></button>
      <button class="round" data-action="grid" title="Grid (G)" aria-label="Grid">${ICONS.grid}</button>
    </nav>
    <div class="scrim" data-action="settings"></div>
    ${settingsSheet()}
    <div class="toast"></div>
    ${svgDialog()}`;
}
