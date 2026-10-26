// Export a palette as CSS custom properties, a Tailwind v4 theme or JSON.
import { cssOklch, toHex } from "./color.ts";
import type { Canvases } from "./canvas.ts";
import type { Palette } from "./palette.ts";
import { STEPS } from "./ramp.ts";
import type { Scales, Theme } from "./tokens.ts";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

function scaleLines(sc: Scales, prefix: string, fmt: (s: string, step: number, v: string) => string) {
  return (Object.keys(sc) as (keyof Scales)[]).flatMap((name) =>
    STEPS.map((step) => fmt(`${prefix}${name}`, step, cssOklch(sc[name][step]))),
  );
}

const brand = (p: Palette, cv: Canvases) => Object.entries({ ...p, ...cv });

export function toCss(p: Palette, cv: Canvases, sc: Scales, t: { light: Theme; dark: Theme }, gradient?: string): string {
  const tokens = (th: Theme) => Object.entries(th).map(([k, v]) => `  --${kebab(k)}: ${v};`).join("\n");
  return [
    ":root {",
    ...brand(p, cv).map(([k, v]) => `  --brand-${k}: ${cssOklch(v)}; /* ${toHex(v)} */`),
    ...scaleLines(sc, "--", (n, s, v) => `  ${n}-${s}: ${v};`),
    tokens(t.light),
    ...(gradient ? [`  --brand-gradient: ${gradient};`] : []),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    tokens(t.dark).replace(/^/gm, "  "),
    "  }",
    "}",
  ].join("\n");
}

/** the gradient (a `background` value whose last layer may be a plain color) as a `background-image` value */
const asImage = (gradient: string) => gradient.replace(/, (#[0-9a-f]{6})$/i, ", linear-gradient($1, $1)");

/** a Tailwind v4 theme: `--color-*` for the colors and scales, `--background-image-brand` (the `bg-brand` utility) for the gradient */
export function toTailwind(p: Palette, cv: Canvases, sc: Scales, gradient?: string): string {
  return [
    "@theme {",
    ...brand(p, cv).map(([k, v]) => `  --color-brand-${k}: ${cssOklch(v)};`),
    ...scaleLines(sc, "--color-", (n, s, v) => `  ${n}-${s}: ${v};`),
    ...(gradient ? [`  --background-image-brand: ${asImage(gradient)};`] : []),
    "}",
  ].join("\n");
}

export function toJson(p: Palette, cv: Canvases, sc: Scales, t: { light: Theme; dark: Theme }): string {
  const hexScale = (r: Scales[keyof Scales]) => Object.fromEntries(STEPS.map((s) => [s, toHex(r[s])]));
  return JSON.stringify(
    {
      palette: Object.fromEntries(brand(p, cv).map(([k, v]) => [k, toHex(v)])),
      scales: Object.fromEntries(Object.entries(sc).map(([k, r]) => [k, hexScale(r)])),
      themes: t,
    },
    null,
    2,
  );
}
