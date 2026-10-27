// Seeded randomness and sampling from fitted distributions.

export interface Rng {
  (): number;
  seed: number;
}

/** A mulberry32 generator. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const rng = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.seed = seed >>> 0;
  return rng;
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

/** Inverse-CDF sampling from an evenly spaced quantile table (q0 … q100). */
export function sampleQuantiles(rng: () => number, qs: readonly number[]): number {
  const u = rng() * (qs.length - 1);
  const i = Math.min(Math.floor(u), qs.length - 2);
  return qs[i] + (qs[i + 1] - qs[i]) * (u - i);
}

/** The index of a weight, drawn with probability proportional to it. */
export function sampleWeighted(rng: () => number, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let u = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    u -= weights[i];
    if (u <= 0) return i;
  }
  return weights.length - 1;
}

export const chance = (rng: () => number, p: number) => rng() < p;
