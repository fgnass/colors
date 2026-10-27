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

const SVG_NS = "http://www.w3.org/2000/svg";
// Static vector artwork only. Styles are resolved in isolation, then removed.
const ELEMENTS = new Set(`svg g defs style title desc path rect circle ellipse polygon polyline line
  text tspan textPath use symbol marker pattern clipPath mask linearGradient radialGradient stop
  filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting
  feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur
  feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence`.split(/\s+/));
const ATTRIBUTES = new Set(`id class style xmlns viewBox preserveAspectRatio x y x1 y1 x2 y2 dx dy
  width height rx ry r cx cy d points transform pathLength href offset gradientUnits gradientTransform
  spreadMethod fx fy fr patternUnits patternContentUnits patternTransform markerWidth markerHeight
  markerUnits refX refY orient clipPathUnits maskUnits maskContentUnits filterUnits primitiveUnits
  in in2 result mode type values operator k1 k2 k3 k4 stdDeviation edgeMode kernelMatrix kernelUnitLength
  order targetX targetY divisor bias preserveAlpha scale xChannelSelector yChannelSelector radius
  baseFrequency numOctaves seed stitchTiles surfaceScale diffuseConstant specularConstant
  specularExponent limitingConeAngle azimuth elevation z pointsAtX pointsAtY pointsAtZ amplitude
  exponent intercept slope tableValues startOffset textLength lengthAdjust`.split(/\s+/));
const PRESENTATION = `fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap
  stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset clip-rule opacity color
  stop-color stop-opacity flood-color flood-opacity lighting-color filter clip-path mask marker-start
  marker-mid marker-end font-family font-size font-style font-weight font-variant letter-spacing
  word-spacing text-anchor dominant-baseline alignment-baseline paint-order vector-effect
  visibility display transform transform-origin transform-box`.split(/\s+/);

function sanitize(svg: Element) {
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    if (el.namespaceURI !== SVG_NS || !ELEMENTS.has(el.localName)) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.localName;
      const allowed = ATTRIBUTES.has(name) || PRESENTATION.includes(name);
      const externalHref = name === "href" && !attr.value.trim().startsWith("#");
      const externalPaint = name !== "style" && /url\s*\(/i.test(attr.value)
        && !/^url\(\s*["']?#[\w:.-]+["']?\s*\)$/.test(attr.value);
      if (!allowed || externalHref || externalPaint) el.removeAttributeNode(attr);
    }
  }
}

/** Only fragment references survive in the exported vector, including computed CSS paints. */
function localPaint(value: string): string | null {
  if (!/url\s*\(/i.test(value)) return value;
  const match = value.match(/^url\(["']?(?:about:srcdoc|about:blank)?#([\w:.-]+)["']?\)$/);
  return match ? `url(#${match[1]})` : null;
}

/** Scripts and external requests are blocked before any imported content is attached. */
async function measurementFrame(): Promise<HTMLIFrameElement> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:absolute;left:-10000px;top:0;width:400px;height:400px;border:0;visibility:hidden";
  const loaded = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("SVG measurement timed out")), 5000);
    frame.onload = () => { clearTimeout(timer); resolve(); };
  });
  frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0}svg{overflow:visible}</style>`;
  document.body.append(frame);
  try {
    await loaded;
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  }
}

/** width / height from the viewBox, else from width and height; 1 when neither is there */
function aspectOf(svg: Element): number {
  const vb = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb[2] > 0 && vb[3] > 0) return vb[2] / vb[3];
  const w = parseFloat(svg.getAttribute("width") ?? ""), h = parseFloat(svg.getAttribute("height") ?? "");
  return w > 0 && h > 0 ? w / h : 1;
}

export async function analyzeSvg(text: string): Promise<SvgArt> {
  const parser = new DOMParser();
  let doc = parser.parseFromString(text.trim(), "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") throw new Error("Not an SVG");
  // Pasted snippets often omit xmlns; normalize them before importing into the HTML document.
  if (doc.documentElement.namespaceURI === null) {
    doc.documentElement.setAttribute("xmlns", SVG_NS);
    doc = parser.parseFromString(new XMLSerializer().serializeToString(doc.documentElement), "image/svg+xml");
  }
  const svg = doc.documentElement;
  if (svg.namespaceURI !== SVG_NS) throw new Error("Not an SVG");
  sanitize(svg);
  // A separate document prevents imported CSS from touching the app or inheriting its styles.
  const frame = await measurementFrame();
  const measuredDocument = frame.contentDocument!;
  const view = frame.contentWindow!;
  const live = measuredDocument.importNode(svg, true) as unknown as SVGSVGElement;
  live.setAttribute("width", "400");
  live.setAttribute("height", "400");
  measuredDocument.body.appendChild(live);
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
      const cs = view.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      const paint = (prop: "fill" | "stroke", value: string, weight: number) => {
        const url = value.match(/url\("?#([^")]+)"?\)/);
        if (url) gradientArea.set(url[1], (gradientArea.get(url[1]) ?? 0) + weight);
        const hex = toHex(value);
        if (hex) add(el, `${prop}:${token(hex, weight)} !important`);
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
        const hex = toHex(view.getComputedStyle(s).stopColor);
        if (hex) add(s, `stop-color:${token(hex, area)} !important`);
      }
    }

    // Bake resolved paint and typography into the clean copy. No imported stylesheet or
    // arbitrary inline declaration is included in the downloadable SVG.
    const own = [svg, ...svg.querySelectorAll("*")];
    const measured = [live, ...live.querySelectorAll("*")];
    measured.forEach((el, i) => {
      const cs = view.getComputedStyle(el);
      const declarations: string[] = [];
      for (const property of PRESENTATION) {
        const value = localPaint(cs.getPropertyValue(property));
        if (value) declarations.push(`${property}:${value}`);
      }
      if (i > 0) {
        for (const property of ["x", "y", "cx", "cy", "r", "rx", "ry", "width", "height", "d"]) {
          const value = localPaint(cs.getPropertyValue(property));
          if (value && value !== "auto" && value !== "none") declarations.push(`${property}:${value}`);
        }
      }
      declarations.push(...(overrides.get(el) ?? []));
      // Discard the source paints too: escaped CSS URLs must not survive in attributes.
      for (const property of PRESENTATION) own[i].removeAttribute(property);
      own[i].setAttribute("style", declarations.join(";"));
    });
    svg.querySelectorAll("style").forEach((el) => el.remove());
    if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", SVG_NS);

    // largest area first; placeholders are renumbered to match
    const order = colors.map((_, i) => i).sort((a, b) => colors[b].area - colors[a].area);
    const rank = new Map(order.map((from, to) => [from, to]));
    const template = new XMLSerializer().serializeToString(svg).replace(/__C(\d+)__/g, (_, i) => `__R${rank.get(Number(i))}__`).replace(/__R/g, "__C");
    return { template, colors: order.map((i) => colors[i]), aspect: aspectOf(svg) };
  } finally {
    frame.remove();
  }
}

/** the SVG with the given color per placeholder */
export const recolorSvg = (art: SvgArt, fills: string[]) => art.template.replace(/__C(\d+)__/g, (_, i) => fills[Number(i)] ?? "#000");

export const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
