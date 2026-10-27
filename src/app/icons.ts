// The icons of the bar and the buttons, as inline SVG.

export const STAR = `<svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>`;

const PADLOCK = `<rect x="3" y="7" width="10" height="7" rx="1.5"/>`;
export const lockIcon = (locked: boolean) =>
  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">${PADLOCK}<path d="${
    locked ? "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" : "M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"
  }"/></svg>`;

/** The bar icons share one 24 grid and one stroke. Shapes, sun, moon, image, swatch book and grid are from Lucide (ISC). */
const icon = (body: string, strokeWidth = 1.5) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** A halftone: a row of dots per shade, growing toward the bottom. */
const halftone = () => {
  const rows = [
    [3.7, 0.6],
    [8.7, 1.1],
    [13.7, 1.6],
    [18.7, 2.2],
  ];
  const dots = rows.flatMap(([cy, r]) =>
    [4.5, 9.5, 14.5, 19.5].map((cx) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`),
  );
  return `<g fill="currentColor" stroke="none">${dots.join("")}</g>`;
};

export const ICONS = {
  shapes: icon(
    `<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>`,
  ),
  gradient: icon(halftone()),
  light: icon(
    `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`,
  ),
  dark: icon(`<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`),
  svg: icon(
    `<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`,
  ),
  details: icon(
    `<path d="M9 6h12M9 12h12M9 18h12"/><g fill="currentColor" stroke="none"><circle cx="4" cy="6" r="1.4"/><circle cx="4" cy="12" r="1.4"/><circle cx="4" cy="18" r="1.4"/></g>`,
  ),
  // A swatch book. With the neon splash on, the front swatch takes the palette's neon (see render()).
  settings: icon(
    `<path class="splash" d="M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z"/><path d="M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7"/><path class="splash-dot" d="M7 17h.01"/><path d="m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8"/>`,
  ),
  help: icon(`<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`),
  grid: icon(
    `<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>`,
  ),
  close: icon(`<path d="M18 6 6 18M6 6l12 12"/>`),
  refresh: icon(`<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>`),
  check: icon(`<path d="M20 6 9 17l-5-5"/>`, 2.5),
  warn: icon(
    `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`,
    2,
  ),
  download: icon(`<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>`),
  upload: icon(`<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>`),
};

/** The film grain over the gradient screen. */
export const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
