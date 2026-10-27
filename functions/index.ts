// The home page: the app, with its link preview in the head (the tags need the page's origin)
import { homeMeta } from "../src/og.ts";
import type { Env } from "./lib.ts";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const page = await env.ASSETS.fetch(new URL("/", request.url));
  const { origin } = new URL(request.url);
  const meta = homeMeta(`${origin}/`, `${origin}/og/home.png`);
  return new HTMLRewriter().on("head", { element: (e) => void e.append(meta, { html: true }) }).transform(page);
};
