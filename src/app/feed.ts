// Moving through the feed. The feed is one list of palettes, which the grid
// shows a page at a time. Opened from the shortlist, the feed walks the
// shortlist instead, until it runs past its end into new palettes.
// Nothing here renders: the caller renders after a move.
import { randomSeed } from "../core/random.ts";
import { toggleEntryLock, type Entry, type LockRole } from "./entry.ts";
import { current, entryAt, isSame, makeEntry, state, type EntrySettings } from "./state.ts";

/** Go to a palette: where it is in the feed, or appended to its end. */
export function push(e: Entry) {
  const i = state.history.findIndex((h) => isSame(h, e));
  if (i >= 0) {
    state.index = i;
  } else {
    state.history.push(e);
    state.index = state.history.length - 1;
  }
  state.next = null;
}

/** The palettes at the indices made again with the same seeds, after a setting changed. */
export function remake(indices: number[], patch: Partial<EntrySettings> = {}) {
  for (const i of indices) {
    const e = state.history[i];
    state.history[i] = makeEntry(e.seed, e.locks, { ...e, ...patch });
  }
  state.next = null;
}

/**
 * While the feed walks the shortlist: the places of the palettes above and
 * below the current one. None below means new palettes follow.
 */
function shortlistNeighbors(): { prev: number | null; next: number | null } | null {
  if (state.shortlistCursor === null) return null;
  const j = state.shortlist.findIndex((f) => isSame(f, current()));
  // The current palette may have been taken off the list, or changed by a lock: then its place is just before the cursor.
  const [p, n] = j >= 0 ? [j - 1, j + 1] : [state.shortlistCursor - 1, state.shortlistCursor];
  return { prev: p >= 0 ? p : null, next: n < state.shortlist.length ? n : null };
}

/** Go to a palette of the shortlist, or (null) leave the shortlist for a new palette. */
export function walkTo(i: number | null, e: Entry) {
  state.shortlistCursor = i;
  push(e);
}

/** The palette below the current one: the next on the shortlist, the next in the feed, or a new one waiting. */
export function nextEntry(): Entry {
  const w = shortlistNeighbors();
  if (w?.next != null) return state.shortlist[w.next];
  if (!w && state.index < state.history.length - 1) return entryAt(state.index + 1);
  if (!state.next) state.next = makeEntry(randomSeed(), current()?.locks ?? {}, state);
  return state.next;
}

/** The palette above the current one, if any. */
export function prevEntry(): Entry | null {
  const w = shortlistNeighbors();
  if (w) return w.prev === null ? null : state.shortlist[w.prev];
  return state.index > 0 ? state.history[state.index - 1] : null;
}

export function goNext() {
  const w = shortlistNeighbors();
  if (w) walkTo(w.next, nextEntry());
  else if (state.index < state.history.length - 1) state.index++;
  else push(nextEntry());
}

export function goPrev() {
  const w = shortlistNeighbors();
  if (w) {
    if (w.prev !== null) walkTo(w.prev, state.shortlist[w.prev]);
  } else if (state.index > 0) {
    state.index--;
  }
}

export function toggleLock(role: LockRole) {
  state.history[state.index] = toggleEntryLock(current(), role);
  state.next = null;
}
