// The link preview image of a shared palette: /og/<key>.png
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import { ogSvg, probeSvg, sharedNames } from "../../src/og.ts";
import { make, parseLink } from "../../src/link.ts";
import { names, type Env } from "../lib.ts";

const FONTS = ["piazzolla-380", "piazzolla-600", "piazzolla-italic-300"];
let ready: Promise<unknown> | null = null;
let fonts: Promise<Uint8Array[]> | null = null;

export const onRequestGet: PagesFunction<Env, "file"> = async ({ request, env, params, waitUntil }) => {
  const key = parseLink(String(params.file).replace(/\.png$/, ""));
  if (!key) return new Response("Not found", { status: 404 });
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  ready ??= initWasm(wasm);
  fonts ??= Promise.all(FONTS.map(async (f) => new Uint8Array(await (await env.ASSETS.fetch(new URL(`/fonts/${f}.ttf`, request.url))).arrayBuffer())));
  const [, fontBuffers] = await Promise.all([ready, fonts, names(env, request)]);
  const opts = { font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Piazzolla" } };

  const shared = make(key);
  const { name } = sharedNames(shared);
  const width = new Resvg(probeSvg(name), opts).getBBox()?.width ?? 1000;
  const png = new Resvg(ogSvg(shared, name, width), opts).render().asPng();
  // the model makes the colors from the key: a new model can change them, so the image is kept for a day only
  const res = new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  waitUntil(cache.put(request, res.clone()));
  return res;
};
