import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntry, LOCKABLE, toggleEntryLock, type Entry } from "./entry.ts";
import { linkKey, make, parseLink } from "../link.ts";
import { toHex } from "../core/color.ts";

function assertReproducible(entry: Entry) {
  const key = parseLink(linkKey(entry));
  assert.ok(key);
  const restored = createEntry(key);
  assert.deepEqual(restored, entry);
  const preview = make(key);
  assert.deepEqual(preview.palette, entry.palette);
  assert.deepEqual(preview.canvas, entry.canvas);
  assert.deepEqual(preview.art, entry.art);
}

test("locking and unlocking each role keeps the displayed entry reproducible", () => {
  for (const token of ["1kcvtvt", "42-n0-c4", "87brr3-f5", "42-m150"]) {
    const key = parseLink(token);
    assert.ok(key);
    let entry = createEntry(key);
    for (const role of LOCKABLE) {
      const color = role === "paper" || role === "ink" ? entry.canvas[role] : entry.palette[role];
      entry = toggleEntryLock(entry, role);
      assert.equal(toHex(entry.locks[role]!), toHex(color));
      assertReproducible(entry);
    }
    for (const role of LOCKABLE) {
      entry = toggleEntryLock(entry, role);
      assert.equal(entry.locks[role], undefined);
      assertReproducible(entry);
    }
  }
});

test("changing artwork and accessibility preferences preserves locked colors and links", () => {
  let entry = createEntry(parseLink("1kcvtvt")!);
  entry = toggleEntryLock(entry, "main");
  const locked = toHex(entry.palette.main);
  for (const colors of [2, 3, 4] as const) {
    entry = createEntry({ ...entry, colors, accessible: true });
    assert.equal(toHex(entry.palette.main), locked);
    assertReproducible(entry);
  }
});
