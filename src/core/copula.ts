// Gaussian copula: correlated normal scores mapped through empirical marginals.
import type { Rng } from "./random.ts";

/** standard normal CDF (Abramowitz-Stegun 7.1.26 via erf) */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** inverse standard normal CDF (Acklam) */
export function normInv(p: number): number {
  p = Math.min(1 - 1e-9, Math.max(1e-9, p));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function gauss(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** value at probability u of an evenly spaced quantile table */
export function quantileAt(qs: readonly number[], u: number): number {
  const x = Math.min(Math.max(u, 0), 1) * (qs.length - 1);
  const i = Math.min(Math.floor(x), qs.length - 2);
  return qs[i] + (qs[i + 1] - qs[i]) * (x - i);
}

/** probability of a value under a quantile table (inverse of quantileAt) */
export function cdfAt(qs: readonly number[], v: number): number {
  if (v <= qs[0]) return 0.5 / qs.length;
  if (v >= qs[qs.length - 1]) return 1 - 0.5 / qs.length;
  for (let i = 0; i < qs.length - 1; i++) {
    if (v <= qs[i + 1]) {
      const span = qs[i + 1] - qs[i] || 1e-9;
      return (i + (v - qs[i]) / span) / (qs.length - 1);
    }
  }
  return 0.5;
}

type Matrix = number[][];

function cholesky(m: Matrix): Matrix {
  const n = m.length;
  const L: Matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  }
  return L;
}

function invert(m: Matrix): Matrix {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => Number(i === j))]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]];
    const d = a[i][i];
    for (let j = 0; j < 2 * n; j++) a[i][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = a[r][i];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[i][j];
    }
  }
  return a.map((row) => row.slice(n));
}

const pick = (m: Matrix, rows: number[], cols: number[]) => rows.map((r) => cols.map((c) => m[r][c]));
const mul = (a: Matrix, b: Matrix): Matrix => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));

export interface Copula {
  vars: string[];
  marginals: number[][];
  corr: number[][];
}

/**
 * Sample all variables. `known` holds fixed values (by variable name);
 * the rest is drawn from the conditional distribution given those.
 */
export function sampleCopula(cop: Copula, rng: Rng, known: Record<string, number> = {}): Record<string, number> {
  return sampleScores(cop, rng, known).values;
}

/** like sampleCopula, plus every variable's normal score */
export function sampleScores(cop: Copula, rng: Rng, known: Record<string, number> = {}): { values: Record<string, number>; z: Record<string, number> } {
  const n = cop.vars.length;
  const fixed = cop.vars.map((v, i) => (v in known ? i : -1)).filter((i) => i >= 0);
  const free = cop.vars.map((_, i) => i).filter((i) => !fixed.includes(i));
  const z = Array<number>(n).fill(0);
  for (const i of fixed) z[i] = normInv(cdfAt(cop.marginals[i], known[cop.vars[i]]));

  let mean = free.map(() => 0);
  let cov = pick(cop.corr, free, free);
  if (fixed.length) {
    const s12 = pick(cop.corr, free, fixed);
    const k = mul(s12, invert(pick(cop.corr, fixed, fixed)));
    mean = mul(k, fixed.map((i) => [z[i]])).map((r) => r[0]);
    const s21 = pick(cop.corr, fixed, free);
    const adj = mul(k, s21);
    cov = cov.map((row, i) => row.map((v, j) => v - adj[i][j]));
  }
  const L = cholesky(cov);
  const e = free.map(() => gauss(rng));
  free.forEach((vi, i) => {
    z[vi] = mean[i] + L[i].reduce((s, v, k) => s + v * e[k], 0);
  });

  const values: Record<string, number> = {};
  const scores: Record<string, number> = {};
  cop.vars.forEach((v, i) => {
    values[v] = v in known ? known[v] : quantileAt(cop.marginals[i], normCdf(z[i]));
    scores[v] = z[i];
  });
  return { values, z: scores };
}
