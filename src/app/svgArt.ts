// Your SVG: a pasted SVG shown in every palette's colors. Each of its colors
// maps to a palette color, automatically or as chosen by the user.
import { contrast, toHex } from "../core/color.ts";
import { fillRoles } from "../art.ts";
import { analyzeSvg, recolorSvg } from "../svg.ts";
import { COLOR_ROLES, colorOf, type ColorRole, type Entry } from "./entry.ts";
import { readStored, writeStored } from "./storage.ts";
import { state } from "./state.ts";

const SVG_KEY = "colors.svg";
const SVG_ROLES_KEY = "colors.svg-roles";

/** A logo-like mark in three colors: the example on the SVG screen, for a look before an SVG of your own. */
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="28" fill="#1d4ed8"/>
  <circle cx="60" cy="60" r="34" fill="#fde68a"/>
  <path d="M60 26A34 34 0 0 1 60 94A44 44 0 0 0 60 26Z" fill="#f43f5e"/>
</svg>`;

/**
 * The automatic mapping, like a plate: the largest color takes the main, the
 * others the fill colors that read on it. Larger shapes need lightness
 * contrast to keep their form; a vivid color with little contrast suits the small ones.
 */
function autoTargets(e: Entry, n: number): ColorRole[] {
  const main = toHex(e.palette.main);
  // As many palette colors as the Colors setting allows, the main included.
  const fills = fillRoles(e.palette, Math.min(n - 1, e.colors - 1)).sort(
    (a, b) => contrast(toHex(e.palette[b]), main) - contrast(toHex(e.palette[a]), main),
  );
  return Array.from({ length: n }, (_, i) => (i === 0 ? "main" : fills[(i - 1) % fills.length]));
}

/** The palette color per SVG color: as chosen by the user, else the automatic one. */
export function svgTargets(e: Entry): ColorRole[] {
  return autoTargets(e, state.svg!.colors.length).map((t, i) => state.svgRoles[i] ?? t);
}

/** The next lexicographic permutation, around to the first after the last. */
function nextPermutation(ids: number[]): number[] {
  const p = [...ids];
  let i = p.length - 2;
  while (i >= 0 && p[i] >= p[i + 1]) i--;
  if (i < 0) return p.sort((a, b) => a - b);
  let j = p.length - 1;
  while (p[j] <= p[i]) j--;
  [p[i], p[j]] = [p[j], p[i]];
  return [...p.slice(0, i + 1), ...p.slice(i + 1).reverse()];
}

/** All arrangements of the SVG's colors, in order. At most `max`: five colors make 120. */
export function allMappings(e: Entry, max = 120): ColorRole[][] {
  const start = svgTargets(e)
    .map((t) => COLOR_ROLES.indexOf(t))
    .sort((a, b) => a - b);
  const toRoles = (ids: number[]) => ids.map((id) => COLOR_ROLES[id]);
  const out = [toRoles(start)];
  for (let p = nextPermutation(start); out.length < max && p.join() !== start.join(); p = nextPermutation(p)) {
    out.push(toRoles(p));
  }
  return out;
}

const saveRoles = () => writeStored(SVG_ROLES_KEY, JSON.stringify(state.svgRoles));

export function setMapping(targets: ColorRole[]) {
  state.svgRoles = Object.fromEntries(targets.map((t, k) => [k, t]));
  saveRoles();
}

/** The SVG in the palette's colors. */
export const recolored = (e: Entry, targets = svgTargets(e)) =>
  recolorSvg(
    state.svg!,
    targets.map((t) => toHex(colorOf(e, t))),
  );

/** Each load gets an id, so a slow load that another one overtook changes nothing. */
let loadId = 0;

export async function useSample() {
  const id = ++loadId;
  const art = await analyzeSvg(SAMPLE_SVG);
  if (id !== loadId) return;
  state.svg = art;
  state.svgSample = true;
  state.svgRoles = {};
}

/** Load an SVG of the user's own and keep it in storage. */
export async function loadSvg(text: string): Promise<"loaded" | "failed" | "stale"> {
  const id = ++loadId;
  try {
    const art = await analyzeSvg(text);
    if (id !== loadId) return "stale";
    state.svg = art;
  } catch {
    return id === loadId ? "failed" : "stale";
  }
  state.svgSample = false;
  state.svgRoles = {};
  saveRoles();
  writeStored(SVG_KEY, text);
  return "loaded";
}

export function removeSvg() {
  loadId++;
  state.svg = null;
  state.svgSample = false;
  writeStored(SVG_KEY, null);
}

/** The SVG and the mapping of the last visit. */
export async function restoreSvg() {
  try {
    const saved = readStored(SVG_KEY);
    const roles = readStored(SVG_ROLES_KEY);
    if (!saved || (await loadSvg(saved)) !== "loaded") return;
    if (roles) {
      state.svgRoles = JSON.parse(roles);
      saveRoles();
    }
  } catch {
    // No storage, or a mapping that is not JSON: the SVG starts with the automatic mapping.
  }
}
