// Type color on a palette color.
import { contrast, toHex, type Lch } from "./color.ts";

/** The color of `options` that reads best on `bg`, by WCAG 2 contrast. */
export const mostReadable = (bg: string, options: Lch[]) =>
  options.reduce((a, b) => (contrast(toHex(b), bg) > contrast(toHex(a), bg) ? b : a));

/**
 * Type color on a background: `prefer` if it reaches `min` contrast, else the
 * most readable of `others` if that does, else the most readable of `fallbacks`.
 */
export function readableOn(bg: Lch, prefer: Lch, others: Lch[], fallbacks: Lch[], min = 3): string {
  const on = toHex(bg);
  if (contrast(toHex(prefer), on) >= min) return toHex(prefer);
  const other = mostReadable(on, others);
  if (contrast(toHex(other), on) >= min) return toHex(other);
  return toHex(mostReadable(on, fallbacks));
}
