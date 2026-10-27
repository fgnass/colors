// The five roles of a palette, apart from the model: the Pages Functions (link previews) need them without
// params.json, as Cloudflare bundles the Functions with an esbuild that does not know import attributes.
export const ROLES = ["main", "companion", "anchor", "light", "dark"] as const;
export type Role = (typeof ROLES)[number];
