import { parseNames } from "../src/core/names.ts";

export interface Env {
  ASSETS: Fetcher;
}

let loaded: Promise<void> | null = null;

/** the color names, loaded once per isolate */
export const names = (env: Env, request: Request) =>
  (loaded ??= env.ASSETS.fetch(new URL("/colornames.txt", request.url))
    .then((r) => r.text())
    .then(parseNames));
