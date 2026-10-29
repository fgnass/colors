// Reproduce the README image and the phone shots from the local app, without a deployed site.
//
//   docs/preview.png                  the README image: a palette with the sidebar, 1440 × 1000
//   public/screenshots/shapes.png     a palette on its shapes, on a phone, 780 × 1688
//   public/screenshots/gradient.png   another palette as a gradient
//   public/screenshots/dark.png       a third one as the dark UI mockup
//
// The phone shots are served at https://colors.gnass.buzz/screenshots/*.png, for gnass.buzz/projects.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:5175";
const PALETTE = "1kcvtvt";
// The phone shots: three palettes, far apart, to show the range.
const PHONE_SHOTS = [
  { name: "shapes", palette: "1i65bec", mode: "shapes" },
  { name: "gradient", palette: "y10rla", mode: "gradient" },
  { name: "dark", palette: "87brr3", mode: "dark" },
];

const server = await createServer({ server: { host: "127.0.0.1", port: 5175, strictPort: true } });
await server.listen();
let browser;

async function open(palette, viewport, deviceScaleFactor, options = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor, ...options });
  // Headless Chromium has no share sheet; most browsers do, so the images show the Share button.
  await page.addInitScript(() => {
    navigator.share ??= async () => {};
  });
  await page.goto(`${BASE}/p/${palette}`);
  await page.locator(".slot.cur .name").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}

try {
  browser = await chromium.launch();

  const wide = await open(PALETTE, { width: 1440, height: 1000 }, 1);
  await mkdir("docs", { recursive: true });
  await wide.screenshot({ path: "docs/preview.png", animations: "disabled" });

  await mkdir("public/screenshots", { recursive: true });
  for (const shot of PHONE_SHOTS) {
    const phone = await open(shot.palette, { width: 390, height: 844 }, 2, { isMobile: true, hasTouch: true });
    if (shot.mode !== "shapes") await phone.locator(`[data-mode=${shot.mode}]`).click();
    await phone.waitForTimeout(600);
    await phone.screenshot({ path: `public/screenshots/${shot.name}.png`, animations: "disabled" });
    await phone.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
