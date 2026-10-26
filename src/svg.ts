// A pasted SVG, recolored with the palette: every color it paints with is
// found (fills, strokes, gradient stops, after CSS and inheritance), weighted
// by the area it covers, and replaced by a palette color.

export interface SvgArt {
  /** the SVG with a placeholder (__C0__, __C1__ …) for every color */
  template: string;
  /** the colors it paints with, largest area first */
  colors: { hex: string; area: number }[];
  /** width / height of the artwork (its viewBox, else its size), 1 when unknown */
  aspect: number;
}

const PAINTED = "path, rect, circle, ellipse, polygon, polyline, line, text";
// content that is not painted as it is
const HIDDEN = "mask, clipPath, defs, symbol, marker, pattern";

function toHex(css: string): string | null {
  const m = css.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m || m[4] === "0") return null;
  return "#" + m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
}

/** remove what could run code once the SVG is in the page */
function sanitize(svg: Element) {
  svg.querySelectorAll("script, foreignObject").forEach((el) => el.remove());
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  }
}

/** width / height from the viewBox, else from width and height; 1 when neither is there */
function aspectOf(svg: Element): number {
  const vb = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb[2] > 0 && vb[3] > 0) return vb[2] / vb[3];
  const w = parseFloat(svg.getAttribute("width") ?? ""), h = parseFloat(svg.getAttribute("height") ?? "");
  return w > 0 && h > 0 ? w / h : 1;
}

export function analyzeSvg(text: string): SvgArt {
  const doc = new DOMParser().parseFromString(text.trim(), "image/svg+xml");
  const svg = doc.documentElement;
  if (doc.querySelector("parsererror") || svg.localName !== "svg") throw new Error("Not an SVG");
  sanitize(svg);
  // measure it in the page: computed styles resolve CSS, inheritance and currentColor
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:400px;visibility:hidden";
  const live = document.importNode(svg, true) as unknown as SVGSVGElement;
  live.setAttribute("width", "400");
  live.setAttribute("height", "400");
  host.appendChild(live);
  document.body.appendChild(host);
  try {
    const index = new Map<string, number>();
    const colors: { hex: string; area: number }[] = [];
    const token = (hex: string, area: number) => {
      if (!index.has(hex)) { index.set(hex, colors.length); colors.push({ hex, area: 0 }); }
      const i = index.get(hex)!;
      colors[i].area += area;
      return `__C${i}__`;
    };
    // what each element gets: a style override per paint property
    const overrides = new Map<Element, string[]>();
    const add = (el: Element, decl: string) => overrides.set(el, [...(overrides.get(el) ?? []), decl]);
    const gradientArea = new Map<string, number>();

    for (const el of live.querySelectorAll(PAINTED)) {
      if (el.closest(HIDDEN)) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      const paint = (prop: "fill" | "stroke", value: string, weight: number) => {
        const url = value.match(/url\("?#([^")]+)"?\)/);
        if (url) gradientArea.set(url[1], (gradientArea.get(url[1]) ?? 0) + weight);
        const hex = toHex(value);
        if (hex) add(el, `${prop}:${token(hex, weight)}`);
      };
      paint("fill", cs.fill, area);
      if (cs.stroke !== "none") paint("stroke", cs.stroke, 2 * (r.width + r.height) * parseFloat(cs.strokeWidth || "1"));
    }

    // gradient stops share the area of what the gradient paints
    for (const g of live.querySelectorAll("linearGradient, radialGradient")) {
      let area = gradientArea.get(g.id) ?? 0;
      if (!area) continue;
      // a gradient without stops takes them from the one it links to
      let src: Element | null = g;
      for (let i = 0; src && !src.querySelector("stop") && i < 4; i++) {
        const ref: string | undefined = (src.getAttribute("href") ?? src.getAttribute("xlink:href"))?.slice(1);
        src = ref ? live.getElementById(ref) : null;
      }
      const stops = src ? [...src.querySelectorAll("stop")] : [];
      area /= stops.length || 1;
      for (const s of stops) {
        const hex = toHex(getComputedStyle(s).stopColor);
        if (hex) add(s, `stop-color:${token(hex, area)}`);
      }
    }

    // write the placeholders into the parsed (not the measured) copy: same element order
    const own = [...svg.querySelectorAll("*")];
    const measured = [...live.querySelectorAll("*")];
    measured.forEach((el, i) => {
      const decls = overrides.get(el);
      if (!decls) return;
      const style = own[i].getAttribute("style");
      own[i].setAttribute("style", [style?.replace(/;\s*$/, ""), ...decls].filter(Boolean).join(";"));
    });
    if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    // largest area first; placeholders are renumbered to match
    const order = colors.map((_, i) => i).sort((a, b) => colors[b].area - colors[a].area);
    const rank = new Map(order.map((from, to) => [from, to]));
    const template = new XMLSerializer().serializeToString(svg).replace(/__C(\d+)__/g, (_, i) => `__R${rank.get(Number(i))}__`).replace(/__R/g, "__C");
    return { template, colors: order.map((i) => colors[i]), aspect: aspectOf(svg) };
  } finally {
    host.remove();
  }
}

/** the SVG with the given color per placeholder */
export const recolorSvg = (art: SvgArt, fills: string[]) => art.template.replace(/__C(\d+)__/g, (_, i) => fills[Number(i)] ?? "#000");

export const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
