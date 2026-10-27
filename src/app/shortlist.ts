// The shortlist: the palettes starred by the user, kept in storage by key.
import { readShortlist, SHORTLIST_KEY, writeStored } from "./storage.ts";
import { identityOf, isSame, makeEntry, state } from "./state.ts";
import type { Entry } from "./entry.ts";

export const onShortlist = (e: Entry) => state.shortlist.some((f) => isSame(f, e));

export function toggleShortlist(e: Entry): "added" | "removed" {
  const wasOn = onShortlist(e);
  state.shortlist = wasOn ? state.shortlist.filter((f) => !isSame(f, e)) : [...state.shortlist, e];
  writeStored(SHORTLIST_KEY, JSON.stringify(state.shortlist.map(identityOf)));
  return wasOn ? "removed" : "added";
}

export function loadShortlist() {
  state.shortlist = readShortlist().map((key) => makeEntry(key.seed, key.locks, key));
}

/** The shortlist made again, after a display preference changed. */
export function remakeShortlist() {
  state.shortlist = state.shortlist.map((e) => makeEntry(e.seed, e.locks, e));
}
