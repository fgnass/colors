// Interface tokens: with the accessible setting, every theme passes WCAG AA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleCanvases } from "./canvas.ts";
import { generatePalettes } from "./palette.ts";
import { createRng } from "./random.ts";
import { accessibility, scales, themes } from "./tokens.ts";

test("accessible tokens pass WCAG AA in light and dark mode", () => {
  const rng = createRng(4321);
  for (let i = 0; i < 1000; i++) {
    const { palette, base } = generatePalettes(rng, {}, { mood: 0, families: [], neon: true, moodRng: createRng(i) });
    const canvas = sampleCanvases(rng, base, {});
    for (const roles of [["main"], ["main", "companion"], ["main", "companion", "anchor"]] as const) {
      const t = themes(palette, canvas, scales(palette, canvas), [...roles], true);
      assert.ok(accessibility(t) >= 1, `palette ${i}, ${roles.length} colors: ${accessibility(t).toFixed(2)}`);
    }
  }
});
