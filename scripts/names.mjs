// Build the color name list: meodai/color-names, filtered to names of one or
// two words where one word is a basic color word from the English
// "Many Languages, Many Colors" list (green, teal, mauve, ochre, …).
//
// usage: node scripts/names.mjs data/names public/colornames.txt

import fs from "node:fs";
import path from "node:path";

const [dir, out] = process.argv.slice(2);
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");

const colorWords = new Set(
  JSON.parse(read("many-languages-en.json")).map((x) => x.name.toLowerCase()).filter((n) => !n.includes(" ")),
);

const kept = JSON.parse(read("meodai-color-names.json")).filter(({ name }) => {
  const words = name.toLowerCase().split(" ");
  return words.length <= 2 && words.some((w) => colorWords.has(w));
});

// one "name<TAB>rrggbb" per line: compact, and loaded by the app at startup
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, kept.map(({ name, hex }) => `${name}\t${hex.slice(1)}`).join("\n") + "\n");
console.log(`${kept.length} names from ${colorWords.size} color words -> ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
