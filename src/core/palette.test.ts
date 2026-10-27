// Fidelity test: generated palettes must reproduce the statistics of the dataset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePalette, generatePalettes, HUE_FAMILIES, isNeon, type Palette } from "./palette.ts";
import { nearestFamily } from "./families.ts";
import { createRng } from "./random.ts";
import { inGamut } from "./color.ts";
import params from "./params.ts";

const N = 4000;
const rng = createRng(1234);
const pals: Palette[] = Array.from({ length: N }, () => generatePalette(rng));

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  const cov = mean(a.map((x, i) => (x - ma) * (b[i] - mb)));
  return cov / Math.sqrt(mean(a.map((x) => (x - ma) ** 2)) * mean(b.map((x) => (x - mb) ** 2)));
};

function metrics(ps: Palette[]) {
  const M = ps.map((p) => p.main), A1 = ps.map((p) => p.companion), A2 = ps.map((p) => p.anchor);
  const Ls = ps.map((p) => [p.main.l, p.companion.l, p.anchor.l]);
  const Cs = ps.map((p) => [p.main.c, p.companion.c, p.anchor.c]);
  const neutral = params.neutralC;
  return {
    medLmain: median(M.map((c) => c.l)),
    medLacc1: median(A1.map((c) => c.l)),
    medLacc2: median(A2.map((c) => c.l)),
    medCmain: median(M.map((c) => c.c)),
    medCacc1: median(A1.map((c) => c.c)),
    medCacc2: median(A2.map((c) => c.c)),
    medAbsDLmainAcc1: median(ps.map((p) => Math.abs(p.main.l - p.companion.l))),
    medAbsDLmainAcc2: median(ps.map((p) => Math.abs(p.main.l - p.anchor.l))),
    medLrange: median(Ls.map((l) => Math.max(...l) - Math.min(...l))),
    shareVeryLight: mean(Ls.map((l) => Number(Math.max(...l) > 0.9))),
    shareHasNeutral: mean(Cs.map((c) => Number(Math.min(...c) < neutral))),
    share2Neutrals: mean(Cs.map((c) => Number(c.filter((v) => v < neutral).length >= 2))),
    corrLmainAcc1: corr(M.map((c) => c.l), A1.map((c) => c.l)),
    corrLacc1Acc2: corr(A1.map((c) => c.l), A2.map((c) => c.l)),
    shareAcc2Extreme: mean(Ls.map(([m, c, a]) => Number(a >= Math.max(m, c) || a <= Math.min(m, c)))),
    p95C: pct(Cs.flat(), 0.95),
  };
}

// absolute tolerances; correlations and shares are noisier in the 309-palette dataset
const TOL: Record<string, number> = {
  medLmain: 0.04, medLacc1: 0.05, medLacc2: 0.06, medCmain: 0.02, medCacc1: 0.025, medCacc2: 0.025,
  medAbsDLmainAcc1: 0.04, medAbsDLmainAcc2: 0.05, medLrange: 0.05, shareVeryLight: 0.08,
  shareHasNeutral: 0.08, share2Neutrals: 0.06, corrLmainAcc1: 0.15, corrLacc1Acc2: 0.15,
  shareAcc2Extreme: 0.07, p95C: 0.025,
};

test("generated palettes match the dataset statistics", () => {
  const got = metrics(pals);
  const rows = Object.entries(params.targets).map(([k, want]) => {
    const g = got[k as keyof typeof got];
    return { metric: k, dataset: want, generated: Number(g.toFixed(4)), ok: Math.abs(g - want) <= TOL[k] };
  });
  console.table(rows);
  const bad = rows.filter((r) => !r.ok).map((r) => r.metric);
  assert.deepEqual(bad, [], `out of tolerance: ${bad.join(", ")}`);
});

test("all colors are in the sRGB gamut and below the chroma ceiling", () => {
  for (const p of pals) for (const c of Object.values(p)) {
    assert.ok(inGamut({ ...c, c: c.c * 0.999 }), JSON.stringify(c));
    assert.ok(c.c <= params.chromaCap + 0.01, JSON.stringify(c));
  }
});

test("same seed gives the same palette", () => {
  assert.deepEqual(generatePalette(createRng(42)), generatePalette(createRng(42)));
});

test("the mood goes from muted to one or two vivid accents", () => {
  const at = (mood: number) => {
    const r = createRng(99);
    return Array.from({ length: 1000 }, () => generatePalette(r, {}, { mood, moodRng: r }));
  };
  const rows = [-1, -0.5, 0, 0.5, 1].map((mood) => {
    const ps = at(mood);
    const core = ps.map((p) => [p.main, p.companion, p.anchor]);
    return {
      mood,
      maxC: Number(median(core.map((cs) => Math.max(...cs.map((c) => c.c)))).toFixed(3)),
      neon: Number((core.filter((cs) => cs.some(isNeon)).length / ps.length).toFixed(2)),
      vivid: Number(mean(core.map((cs) => cs.filter((c) => c.c > 0.15).length)).toFixed(2)),
      three: Number((core.filter((cs) => cs.filter((c) => c.c > 0.15).length === 3).length / ps.length).toFixed(3)),
      Lrange: Number(median(core.map((cs) => Math.max(...cs.map((c) => c.l)) - Math.min(...cs.map((c) => c.l)))).toFixed(3)),
    };
  });
  console.table(rows);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].maxC > rows[i - 1].maxC, `chroma rises with the mood at ${rows[i].mood}`);
  // at the vivid end, the accents are vivid and the others held back
  assert.ok(rows[4].vivid <= 2, `at most two vivid colors: ${rows[4].vivid}`);
  assert.ok(rows[4].three < 0.05, `three vivid colors stay rare: ${rows[4].three}`);
  // the muted end is the dataset's least vivid tail (10th percentile of the strongest chroma ≈ 0.084), not greyer
  assert.ok(rows[0].maxC > 0.075, `muted, not grey: ${rows[0].maxC}`);
  assert.ok(rows[4].neon > rows[2].neon, "more neon at the vivid end");
});

test("moving the mood changes the colors continuously, not the palette", () => {
  for (let seed = 0; seed < 200; seed++) {
    const at = (mood: number) => generatePalettes(createRng(seed), {}, { mood, moodRng: createRng(seed ^ 7) });
    const base = at(0).base;
    let prev = at(-1).palette;
    for (let m = -0.95; m <= 1.001; m += 0.05) {
      const { palette, base: b } = at(m);
      assert.deepEqual(b, base, "the palette without the mood stays the same");
      for (const r of ["main", "companion", "anchor"] as const) {
        const d = Math.hypot(palette[r].l - prev[r].l, palette[r].c - prev[r].c);
        assert.ok(d < 0.06, `seed ${seed}, ${r} jumps by ${d.toFixed(3)} at mood ${m.toFixed(2)}`);
      }
      prev = palette;
    }
  }
});

test("a hue family puts a color of that family into every palette", () => {
  const r = createRng(5);
  for (const { name } of HUE_FAMILIES) {
    const ps = Array.from({ length: 300 }, () => generatePalette(r, {}, { families: [name] }));
    const hit = ps.filter((p) => [p.main, p.companion, p.anchor].some((c) => c.c >= 0.05 && nearestFamily(c.h).name === name)).length;
    // any role carries it, not only the main
    const mains = ps.filter((p) => p.main.c >= 0.05 && nearestFamily(p.main.h).name === name).length;
    console.log(`${name}: ${hit}/300, as main ${mains}`);
    assert.equal(hit, 300, name);
    assert.ok(mains < 300, `${name} is not always the main`);
  }
});

test("two hue families need two colors; the same twice is monochrome", () => {
  const r = createRng(11);
  const fam = (c: { c: number; h: number }) => (c.c >= 0.05 ? nearestFamily(c.h).name : null);
  const t0 = performance.now();
  for (const [a, b] of [["blue", "orange"], ["green", "pink"], ["purple", "purple"], ["yellow", "yellow"]]) {
    for (let i = 0; i < 100; i++) {
      const p = generatePalette(r, {}, { families: [a, b] });
      const fs = [p.main, p.companion, p.anchor].map(fam);
      if (a === b) {
        const colored = fs.filter(Boolean);
        assert.ok(colored.length >= 2 && colored.every((f) => f === a), `${a} monochrome: ${fs}`);
      } else {
        assert.ok(fs.includes(a) && fs.includes(b), `${a} + ${b}: ${fs}`);
        assert.ok(fs.every((f) => f === null || f === a || f === b), `${a} + ${b}, no third hue: ${fs}`);
      }
    }
  }
  console.log(`400 palettes with two families in ${(performance.now() - t0).toFixed(0)} ms`);
});
