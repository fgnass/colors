// Reproduce the README image from the local app, without a deployed site.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";

const server = await createServer({ server: { host: "127.0.0.1", port: 5175, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  // Headless Chromium has no share sheet; most browsers do, so the image shows the Share button.
  await page.addInitScript(() => {
    navigator.share ??= async () => {};
  });
  await page.goto("http://127.0.0.1:5175/p/1kcvtvt");
  await page.locator(".slot.cur .name").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await mkdir("docs", { recursive: true });
  await page.screenshot({ path: "docs/preview.png", animations: "disabled" });
} finally {
  await browser?.close();
  await server.close();
}
