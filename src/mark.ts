// The mark: a C of four rings, each in a color. The favicon is the mark in the
// current palette's colors, on its main (fixed colors in public/favicon.svg, for the first load).
import { contrast } from "./core/color.ts";

/** less contrast to the background than this, and a ring does not read */
const MIN_CONTRAST = 2;

/**
 * The rings' colors (inner to outer) on a background: outside the color that
 * stands out most from it (of `colors` and `more`), inside the other `colors`
 * in their order; one that does not read takes the outer ring's color.
 */
export function ringColors(background: string, colors: string[], more: string[] = []): string[] {
  const outer = [...colors, ...more].reduce((a, b) => (contrast(b, background) > contrast(a, background) ? b : a));
  const inner = colors.filter((c) => c !== outer).slice(0, 3).map((c) => (contrast(c, background) < MIN_CONTRAST ? outer : c));
  return [...inner, outer];
}

/** the rings, inner to outer */
const RINGS = [
  "M66.15 83.32L62.75 85.9Q57.66 79.57 49.63 79.57Q42.66 79.57 37.71 84.52Q32.75 89.47 32.75 96.45Q32.75 103.42 37.71 108.37Q42.66 113.32 49.63 113.32Q53.55 113.32 56.98 111.62Q60.41 109.92 62.81 106.93L66.09 109.69Q63.16 113.38 58.83 115.46Q54.49 117.54 49.63 117.54Q40.9 117.54 34.72 111.36Q28.54 105.18 28.54 96.45Q28.54 87.71 34.72 81.53Q40.9 75.35 49.63 75.35Q54.55 75.35 58.89 77.49Q63.22 79.63 66.15 83.32Z",
  "M72.71 78.05L69.38 80.63Q65.86 76.17 60.67 73.65Q55.49 71.13 49.63 71.13Q39.14 71.13 31.73 78.57Q24.32 86.02 24.32 96.45Q24.32 106.88 31.73 114.32Q39.14 121.76 49.63 121.76Q55.49 121.76 60.7 119.21Q65.92 116.66 69.43 112.21L72.66 114.9Q68.55 120.06 62.52 123.02Q56.48 125.98 49.63 125.98Q41.6 125.98 34.8 122.02Q28.01 118.07 24.05 111.27Q20.1 104.47 20.1 96.45Q20.1 88.42 24.05 81.62Q28.01 74.82 34.8 70.87Q41.6 66.91 49.63 66.91Q56.48 66.91 62.55 69.87Q68.61 72.83 72.71 78.05Z",
  "M79.34 72.77L76.05 75.41Q71.31 69.49 64.39 66.09Q57.48 62.7 49.63 62.7Q42.77 62.7 36.53 65.36Q30.29 68.03 25.75 72.57Q21.21 77.11 18.54 83.35Q15.88 89.59 15.88 96.45Q15.88 103.3 18.54 109.54Q21.21 115.78 25.75 120.32Q30.29 124.86 36.53 127.53Q42.77 130.2 49.63 130.2Q57.48 130.2 64.39 126.8Q71.31 123.4 76.05 117.48L79.22 120.23Q73.89 126.86 66.15 130.63Q58.42 134.41 49.63 134.41Q41.89 134.41 34.86 131.4Q27.83 128.38 22.76 123.31Q17.7 118.24 14.68 111.21Q11.66 104.18 11.66 96.45Q11.66 88.71 14.68 81.68Q17.7 74.65 22.76 69.58Q27.83 64.51 34.86 61.49Q41.89 58.48 49.63 58.48Q58.48 58.48 66.24 62.29Q74 66.09 79.34 72.77Z",
  "M85.9 67.5L82.5 70.02Q76.58 62.7 68 58.48Q59.41 54.26 49.63 54.26Q41.07 54.26 33.25 57.6Q25.43 60.94 19.78 66.59Q14.12 72.25 10.78 80.07Q7.44 87.89 7.44 96.45Q7.44 105 10.78 112.82Q14.12 120.64 19.78 126.3Q25.43 131.95 33.25 135.29Q41.07 138.63 49.63 138.63Q59.41 138.63 68 134.41Q76.58 130.2 82.5 122.87L85.84 125.45Q79.34 133.54 69.87 138.19Q60.41 142.85 49.63 142.85Q40.2 142.85 31.61 139.16Q23.03 135.47 16.82 129.26Q10.61 123.05 6.91 114.46Q3.22 105.88 3.22 96.45Q3.22 87.01 6.91 78.43Q10.61 69.84 16.82 63.63Q23.03 57.42 31.61 53.73Q40.2 50.04 49.63 50.04Q60.41 50.04 69.9 54.7Q79.39 59.36 85.9 67.5Z",
];

/** the mark in four colors (inner to outer), in a square around it; with a background, on a rounded square */
export function markSvg(colors: string[], background?: string): string {
  // the mark's box is x 3.22…85.9, y 50.04…142.85: a square around its middle (44.56, 96.45), more room on a background
  const side = background ? 124 : 98, x = +(44.56 - side / 2).toFixed(2), y = +(96.45 - side / 2).toFixed(2);
  const plate = background ? `<rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${side * 0.22}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}">${plate}${RINGS.map((d, i) => `<path d="${d}" fill="${colors[i]}"/>`).join("")}</svg>`;
}
