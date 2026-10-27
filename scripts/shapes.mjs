// Split the tile shapes into separately fillable pieces.
//
// Each SVG is one path made of subpaths. A subpath is either a piece of the
// shape or a hole in another piece (e.g. the inside of a ring). A subpath is a
// hole if a point inside it is not filled by the whole path (nonzero rule);
// a hole belongs to the smallest piece that contains it. Pieces that touch
// are recorded as neighbours, so they can get different colors.
//
// One-piece shapes can be split into their four quadrants instead, if every
// quadrant holds enough of the shape (many shapes are built on a 2 × 2 grid),
// or into bands. Rings of circles are rebuilt as whole, overlapping circles.
//
// usage: node scripts/shapes.mjs data/shapes src/shapes.ts

import fs from "node:fs";
import path from "node:path";

const [dir, out] = process.argv.slice(2);

/** split a path (absolute M L C Z only) into subpaths: { d, points } */
function subpaths(d) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const result = [];
  let cur = null;
  let i = 0;
  let x = 0;
  let y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      x = num();
      y = num();
      cur = { parts: [`M ${x} ${y}`], points: [[x, y]] };
      result.push(cur);
    } else if (cmd === "L") {
      x = num();
      y = num();
      cur.parts.push(`L ${x} ${y}`);
      cur.points.push([x, y]);
    } else if (cmd === "C") {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      cur.parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`);
      // flatten the curve for geometry tests
      for (let s = 1; s <= 12; s++) {
        const t = s / 12,
          u = 1 - t;
        cur.points.push([
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else if (cmd === "Z") {
      cur.parts.push("Z");
    } else {
      throw new Error(`unexpected token ${cmd}`);
    }
  }
  return result.map((s) => ({ d: s.parts.join(" "), points: s.points }));
}

/** winding number of a closed polygon around a point */
function winding(poly, [px, py]) {
  let w = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
    if (y1 <= py && y2 > py && cross > 0) w++;
    else if (y1 > py && y2 <= py && cross < 0) w--;
  }
  return w;
}

function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function distToEdges(poly, [px, py]) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1,
      dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - x1 - t * dx, py - y1 - t * dy));
  }
  return best;
}

/**
 * A point well inside a polygon's own area: inside it, outside every smaller
 * subpath that lies within it (so not in one of its holes), and as far as
 * possible from all edges of the shape.
 */
function interiorPoint(poly, all) {
  const inner = all.filter((q) => q !== poly && area(q) < area(poly) && winding(poly, q[0]) !== 0);
  const xs = poly.map((p) => p[0]),
    ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null,
    bestD = -1;
  for (let i = 1; i < 24; i++) {
    for (let j = 1; j < 24; j++) {
      const p = [x0 + ((x1 - x0) * i) / 24, y0 + ((y1 - y0) * j) / 24];
      if (winding(poly, p) === 0 || inner.some((q) => winding(q, p) !== 0)) continue;
      const d = Math.min(...all.map((q) => distToEdges(q, p)));
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

/** smallest distance between the outlines of two point sets */
function gap(a, b) {
  let best = Infinity;
  for (const p of a)
    for (const q of b) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < best) best = d;
    }
  return best;
}

// ---------- rings of circles ----------

const O = [128, 128];
const angleAt = ([x, y]) => Math.atan2(y - O[1], x - O[0]);
const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** circles the path's arcs lie on: fit a circle to each cubic (start, midpoint, end) */
function circlesOf(d) {
  const t = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const found = [];
  let i = 0,
    x = 0,
    y = 0;
  const n = () => Number(t[i++]);
  while (i < t.length) {
    const c = t[i++];
    if (c === "M" || c === "L") {
      x = n();
      y = n();
    } else if (c === "C") {
      const p = [n(), n(), n(), n(), n(), n()];
      const m = [(x + 3 * p[0] + 3 * p[2] + p[4]) / 8, (y + 3 * p[1] + 3 * p[3] + p[5]) / 8];
      const [ax, ay, bx, by, cx, cy] = [x, y, m[0], m[1], p[4], p[5]];
      const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(D) > 1e-6) {
        const ux =
          ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
        const uy =
          ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
        const r = Math.hypot(ax - ux, ay - uy);
        if (!found.some((q) => Math.hypot(q[0] - ux, q[1] - uy) < 1.5 && Math.abs(q[2] - r) < 1.5))
          found.push([ux, uy, r]);
      }
      x = p[4];
      y = p[5];
    }
  }
  return found.sort((a, b) => angleAt(a) - angleAt(b));
}

/** the two intersection points of two circles, the one nearer the tile centre first */
function intersect([x1, y1, r1], [x2, y2, r2]) {
  const dx = x2 - x1,
    dy = y2 - y1,
    dd = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
  const mx = x1 + (a * dx) / dd,
    my = y1 + (a * dy) / dd;
  const pts = [
    [mx + (h * dy) / dd, my - (h * dx) / dd],
    [mx - (h * dy) / dd, my + (h * dx) / dd],
  ];
  return pts.sort((p, q) => Math.hypot(p[0] - O[0], p[1] - O[1]) - Math.hypot(q[0] - O[0], q[1] - O[1]));
}

/** SVG arc on circle c from p to q that passes the point of c in direction `towards` (radians) */
function arc(c, p, q, towards) {
  const a0 = Math.atan2(p[1] - c[1], p[0] - c[0]);
  const a1 = Math.atan2(q[1] - c[1], q[0] - c[0]);
  const ccw = norm(a1 - a0); // sweep with increasing angle (SVG sweep-flag 1)
  const passes = norm(towards - a0) < ccw;
  const span = passes ? ccw : 2 * Math.PI - ccw;
  const f = (v) => +v.toFixed(3);
  return `A ${f(c[2])} ${f(c[2])} 0 ${span > Math.PI ? 1 : 0} ${passes ? 1 : 0} ${f(q[0])} ${f(q[1])}`;
}

const f3 = (v) => +v.toFixed(3);
const circlePath = ([x, y, r]) =>
  `M ${f3(x - r)} ${f3(y)} A ${f3(r)} ${f3(r)} 0 1 0 ${f3(x + r)} ${f3(y)} A ${f3(r)} ${f3(r)} 0 1 0 ${f3(x - r)} ${f3(y)} Z`;

/** circle a without its overlap with circle b (b shows through there) */
function withoutOverlap(a, b) {
  const [p, q] = intersect(a, b);
  const heading = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]);
  return `M ${f3(p[0])} ${f3(p[1])} ${arc(a, p, q, heading(b, a))} ${arc(b, q, p, heading(b, a))} Z`;
}

/**
 * A ring of whole circles that overlap like a chain: each circle lies on top
 * of the next one. The last circle is drawn first, then the others backwards,
 * and the first circle without its overlap with the last one, so the last
 * shows through there and the chain closes without a visible start. Edges
 * never coincide with a layer on top, so no seams appear.
 */
function ringPieces(circles) {
  const k = circles.length;
  const middle = circles
    .map((_, i) => i)
    .slice(1)
    .reverse(); // k-1, k-2, ..., 1
  return {
    pieces: [...middle.map((i) => circlePath(circles[i])), withoutOverlap(circles[0], circles[k - 1])],
    part: [...middle, 0],
  };
}

// ---------- shapes ----------

// Shapes that look wrong when quartered, picked by eye: the cut slices one
// continuous form unevenly (frames, the S curve, slanted bars, the leaf hole).
// Quartering works when each quadrant reads as a motif of its own.
const NO_QUARTER = new Set([8, 15, 27, 57, 68, 70, 71]);
// Shapes of several pieces that are built on a 2 × 2 grid: quartered too.
const QUARTER_MULTI = new Set([3, 6, 9, 10, 12, 17, 19, 25, 30, 33, 39, 49]);
// Shapes built from bands: split into horizontal bands (y ranges) instead.
const BANDS = {
  55: [
    [0, 64],
    [64, 192],
    [192, 256],
  ],
};
// Rings of circles: rebuilt as whole, overlapping circles.
const RINGS = new Set([41, 47]);

const QUADRANTS = {
  rects: [
    [0, 0, 128, 128],
    [128, 0, 128, 128],
    [0, 128, 128, 128],
    [128, 128, 128, 128],
  ],
  neighbours: [
    [1, 2],
    [0, 3],
    [0, 3],
    [1, 2],
  ],
};
const bands = (ys) => ({
  rects: ys.map(([y0, y1]) => [0, y0, 256, y1 - y0]),
  neighbours: ys.map((_, i) => [i - 1, i + 1].filter((j) => j >= 0 && j < ys.length)),
});
const inRect = ([x, y], [rx, ry, w, h]) => x >= rx && x < rx + w && y >= ry && y < ry + h;

const shapes = [];
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".svg"))
  .sort();
for (const f of files) {
  const no = shapes.length + 1;
  const d = fs.readFileSync(path.join(dir, f), "utf8").match(/<path d="([^"]+)"/)[1];
  const subs = subpaths(d);
  const polys = subs.map((s) => s.points);
  const filled = (p) => polys.reduce((w, poly) => w + winding(poly, p), 0) !== 0;
  const cells = []; // sample points of the filled shape, for areas
  const N = 64;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const p = [((i + 0.5) * 256) / N, ((j + 0.5) * 256) / N];
      if (filled(p)) cells.push(p);
    }
  const cell = (256 / N) ** 2;

  if (RINGS.has(no)) {
    const circles = circlesOf(d);
    const k = circles.length;
    const { pieces, part } = ringPieces(circles);
    // visible area per circle: the topmost circle at each sample (i over i + 1, the last over the first)
    const inside = (p, c) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= c[2];
    const areas = Array(k).fill(0);
    const N2 = 128;
    for (let i = 0; i < N2; i++)
      for (let j = 0; j < N2; j++) {
        const p = [((i + 0.5) * 256) / N2, ((j + 0.5) * 256) / N2];
        const hits = circles.map((c, n) => (inside(p, c) ? n : -1)).filter((n) => n >= 0);
        if (!hits.length) continue;
        const top = hits.includes(0) && hits.includes(k - 1) ? k - 1 : Math.min(...hits);
        areas[top] += (256 / N2) ** 2;
      }
    shapes.push({
      split: null,
      pieces,
      part,
      areas: areas.map(Math.round),
      neighbours: circles.map((_, i) => [(i - 1 + k) % k, (i + 1) % k]),
    });
    continue;
  }

  const info = subs.map((s, i) => {
    const p = interiorPoint(s.points, polys);
    return { ...s, i, p, area: area(s.points), hole: !p || !filled(p) };
  });
  const pieces = info.filter((s) => !s.hole).map((s) => ({ ...s, holes: [] }));
  for (const h of info.filter((s) => s.hole)) {
    const owner = pieces.filter((pc) => h.p && winding(pc.points, h.p) !== 0).sort((a, b) => a.area - b.area)[0];
    if (owner) owner.holes.push(h);
    else throw new Error(`${f}: hole without owner`);
  }
  const outlines = pieces.map((pc) => [pc.points, ...pc.holes.map((h) => h.points)].flat());
  const neighbours = pieces.map((_, i) =>
    pieces.map((__, j) => j).filter((j) => j !== i && gap(outlines[i], outlines[j]) < 2),
  );

  // a one-piece shape (or one on a 2 × 2 grid) can be split into quadrants, or into bands
  const layout = BANDS[no] ? bands(BANDS[no]) : QUADRANTS;
  const splitAreas = layout.rects.map((r) => cells.filter((p) => inRect(p, r)).length * cell);
  // each part needs at least 8 % of a quadrant filled to be worth a color
  const splittable =
    (pieces.length === 1 || QUARTER_MULTI.has(no)) &&
    splitAreas.every((a) => a >= 0.08 * 128 * 128) &&
    !NO_QUARTER.has(no);
  shapes.push({
    split: splittable ? { ...layout, areas: splitAreas.map(Math.round) } : null,
    pieces: pieces.map((pc) => [pc.d, ...pc.holes.map((h) => h.d)].join(" ")),
    part: pieces.map((_, i) => i),
    areas: pieces.map((pc) => Math.round(pc.area - pc.holes.reduce((s, h) => s + h.area, 0))),
    neighbours,
  });
}

const src = `// 72 tile shapes (256 × 256) from "SVG Shapes" by Monika Michalczyk,
// https://www.shapes.gallery — thank you!
// Generated by scripts/shapes.mjs: each shape is split into pieces that can be
// filled separately (holes stay with their piece), with their filled area and
// which pieces touch. One-piece shapes can be split into quadrants or bands;
// rings of circles are rebuilt as whole, overlapping circles.
export const SHAPE_SIZE = 256;

export interface Shape {
  /** how a one-piece shape can be split into parts: clip rectangles (x, y, w, h), filled area and neighbours per part */
  split: { rects: number[][]; areas: number[]; neighbours: number[][] } | null;
  /** paths in drawing order */
  pieces: string[];
  /** the part each path belongs to; a part can be drawn with several paths */
  part: number[];
  /** filled (visible) area per part */
  areas: number[];
  /** parts that touch, per part */
  neighbours: number[][];
}

export const SHAPES: readonly Shape[] = ${JSON.stringify(shapes)};
`;
fs.writeFileSync(out, src);
const counts = {};
for (const s of shapes) counts[s.areas.length] = (counts[s.areas.length] ?? 0) + 1;
console.log("parts per shape:", counts, " splittable shapes:", shapes.filter((s) => s.split).length);
