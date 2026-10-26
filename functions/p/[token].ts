// A shared palette's page: the app, with the palette's link preview in the head.
import { ogMeta } from "../../src/og.ts";
import { parseShare } from "../../src/share.ts";
import { names, type Env } from "../lib.ts";

export const onRequestGet: PagesFunction<Env, "token"> = async ({ request, env, params }) => {
  const page = await env.ASSETS.fetch(new URL("/", request.url));
  const token = String(params.token);
  const shared = parseShare(token);
  if (!shared) return page;
  await names(env, request);
  const url = new URL(request.url);
  const { title, meta } = ogMeta(shared, `${url.origin}${url.pathname}`, `${url.origin}/og/${token}.png`);
  return new HTMLRewriter()
    .on("title", { element: (e) => void e.setInnerContent(title) })
    .on('meta[name="description"]', { element: (e) => void e.remove() })
    .on("head", { element: (e) => void e.append(meta, { html: true }) })
    .transform(page);
};
