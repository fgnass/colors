import { test } from "node:test";
import assert from "node:assert/strict";
import { copyText } from "./clipboard.ts";

test("copy feedback waits for the clipboard write", async () => {
  const messages: string[] = [];
  let complete!: () => void;
  const pending = copyText("#123456", "color", (message) => messages.push(message), {
    writeText: (text) => {
      assert.equal(text, "#123456");
      return new Promise<void>((resolve) => { complete = resolve; });
    },
  });
  assert.deepEqual(messages, []);
  complete();
  await pending;
  assert.deepEqual(messages, ["Copied color"]);
});

test("clipboard errors never report success", async () => {
  const messages: string[] = [];
  await copyText("text", "text", (message) => messages.push(message), {
    writeText: async () => { throw new Error("Permission denied"); },
  });
  assert.deepEqual(messages, ["Could not copy. Please try again."]);
});
