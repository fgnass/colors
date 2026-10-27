import { test, expect } from "@playwright/test";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <style>.shape { fill: #ff0000 !important } body { background: #ff00ff !important }</style>
  <rect class="shape" width="100" height="100"/>
</svg>`;

test("locked links and shortlist restore the displayed colors", async ({ page }) => {
  await page.goto("/p/1kcvtvt");
  const colors = () => page.locator(".side .roles .hex").allTextContents();
  await expect(page.locator(".slot.cur .name")).toContainText("Florence Red");
  await page.locator('.side [data-lock="main"]').click();
  const lockedColors = await colors();
  const url = page.url();
  expect(url).toContain("-lm75403c");
  await page.keyboard.press("f");
  await page.reload();
  await expect.poll(colors).toEqual(lockedColors);
  expect(page.url()).toBe(url);
  await page.keyboard.press("s");
  await expect(page.locator(".wall .tile")).toHaveCount(1);
  await page.locator("[data-pick]").first().click();
  await expect.poll(colors).toEqual(lockedColors);
});

test("SVG CSS stays isolated and resolved colors survive recoloring", async ({ page }) => {
  await page.goto("/p/1kcvtvt");
  const result = await page.evaluate(async (text) => {
    const { analyzeSvg, recolorSvg } = await import("/src/svg.ts");
    let bodyDuringMeasurement;
    const observer = new MutationObserver(() => {
      if (document.querySelector("iframe")) bodyDuringMeasurement = getComputedStyle(document.body).backgroundColor;
    });
    observer.observe(document.body, { childList: true });
    const before = getComputedStyle(document.body).backgroundColor;
    const art = await analyzeSvg(text);
    observer.disconnect();
    return {
      before,
      during: bodyDuringMeasurement,
      colors: art.colors,
      output: recolorSvg(art, ["#123456"]),
      frames: document.querySelectorAll("iframe").length,
    };
  }, SVG);
  expect(result.during).toBe(result.before);
  expect(result.colors).toEqual([{ hex: "#ff0000", area: 160000 }]);
  expect(result.output).not.toContain("<style");
  expect(result.output).toContain("fill:#123456 !important");
  expect(result.frames).toBe(0);
});

test("SVG analysis blocks external resources and removes active content from exports", async ({ page }) => {
  await page.goto("/p/1kcvtvt");
  const requests = [];
  await page.route("https://svg-import.invalid/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const output = await page.evaluate(async () => {
    const { analyzeSvg } = await import("/src/svg.ts");
    const art =
      await analyzeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="window.__svgExecuted=true">
      <script>parent.__svgExecuted=true</script>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>
      <style>@import url('https://svg-import.invalid/style.css'); rect { fill: url('https://svg-import.invalid/paint.svg#p') red; }</style>
      <image href="https://svg-import.invalid/image.png" width="100" height="100"/>
      <use href="https://svg-import.invalid/use.svg#p"/>
      <animate attributeName="href" values="javascript:alert(1)"/>
      <rect width="100" height="100" style="background:url('https://svg-import.invalid/bg.png')"/>
      <path fill="u\\72l(https://svg-import.invalid/escaped.svg#p)" d="M0 0h10v10z"/>
    </svg>`);
    return { template: art.template, executed: window.__svgExecuted ?? false };
  });
  expect(requests).toEqual([]);
  expect(output.executed).toBe(false);
  expect(output.template).not.toMatch(/svg-import\.invalid|<script|foreignObject|<image|<animate|onload|javascript:/);
});

test("SVG gradients retain local references and recolorable stops", async ({ page }) => {
  await page.goto("/p/1kcvtvt");
  const result = await page.evaluate(async () => {
    const { analyzeSvg, recolorSvg } = await import("/src/svg.ts");
    const art = await analyzeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><linearGradient id="paint"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>
      <rect width="100" height="100" fill="url(#paint)"/>
    </svg>`);
    return { colors: art.colors, output: recolorSvg(art, ["#123456", "#abcdef"]) };
  });
  expect(result.colors.map((color) => color.hex).sort()).toEqual(["#0000ff", "#ff0000"]);
  expect(result.output).toContain("url(#paint)");
  expect(result.output).toContain("stop-color:#123456 !important");
  expect(result.output).toContain("stop-color:#abcdef !important");
});

test("SVG sample and user imports render through the app", async ({ page }) => {
  await page.goto("/p/1kcvtvt");
  await page.getByRole("button", { name: "Your SVG", exact: true }).click();
  await page.locator('.slot.cur [data-svg="sample"]').click();
  await expect(page.locator(".slot.cur .svg-big img")).toBeVisible();
  await page.locator('.slot.cur [data-svg="open"]').click();
  await page.locator('textarea[name="code"]').fill(SVG);
  await page.getByRole("button", { name: "Use", exact: true }).click();
  await expect(page.locator('.slot.cur [data-svg="download"]')).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("SVG with 1 color");
});

test("SVG snippets preserve CSS geometry without retaining stylesheets", async ({ page }) => {
  await page.goto("/p/1kcvtvt");
  const output = await page.evaluate(async () => {
    const { analyzeSvg } = await import("/src/svg.ts");
    const art = await analyzeSvg(
      `<svg viewBox="0 0 100 100"><style>rect { x: 10px; width: 50px; height: 25px; transform: translateX(5px); fill: #ff0000 }</style><rect/></svg>`,
    );
    return { colors: art.colors, template: art.template };
  });
  expect(output.colors).toEqual([{ hex: "#ff0000", area: 20000 }]);
  expect(output.template).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(output.template).toContain("width:50px");
  expect(output.template).toContain("transform:matrix(1, 0, 0, 1, 5, 0)");
  expect(output.template).not.toContain("<style");
});

test("legacy shortlist keys migrate without losing saved palettes", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("colors.shortlist", JSON.stringify(["#1kcvtvt;n1"]));
  });
  await page.goto("/p/1kcvtvt");
  await page.keyboard.press("s");
  await expect(page.locator(".wall .tile")).toHaveCount(1);
  await page.locator("[data-pick]").first().click();
  await expect(page.locator(".slot.cur .name")).toContainText("Florence Red");
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("colors.shortlist")))).toEqual([]);
});
