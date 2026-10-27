# Using Colors

[Back to the project](../README.md)

## The app

One palette per screen, in its own colors. Swipe up (wheel, ↓ or Space) for
the next palette, down (↑) for the one before. The bar at the bottom switches
what the screen shows: the shapes, the gradient, the interface in light or
dark, your SVG (V cycles), and on a phone the details. The settings button
holds the hue families, the number of colors and the neon splash; the grid
button opens the grid. Without a link, the app starts with the neon splash on
and three colors in the artwork. The first visit shows a line of hints below
the bar: one thing to try at a time (scroll, the gradient view, …, the
settings, the grid and the shortlist), with a ring on its control; everything
stays usable and whatever is tried counts, in any order, until all was tried
(the ? button in the grid brings the hints back).

- **Details**: the roles with their locks (1–5), the canvases, the scales, the
  export tabs and the link. On a wide screen they are the sidebar, frosted
  over the palette; on a phone a screen of their own.
- **Grid and shortlist**: the feed is one list of palettes, and the grid shows
  it a page at a time, as many palettes as fill the viewport in full rows. The
  palette the feed is on is outlined, and a tap on a tile puts the feed there.
  Scrolling past the end of the feed makes new palettes, so does New set
  (Space), which starts a new page. Its tiles, all in the plates' 4:5 format, show whatever the
  bar is set to. Starred palettes (F, or the star on a tile) go on the
  shortlist (S).
- **Your SVG**: paste (⌘V), drop or choose an SVG, and see it in every
  palette (in the grid too); or use the example logo for a look first. The colors it paints with are found after CSS
  and inheritance (fills, strokes, gradient stops; masks and clip paths are
  left alone) and ranked by the area they cover. Like a plate, the largest
  color takes the main and the others the fill colors that read on it; every
  arrangement of the same colors is shown small below (the current one
  outlined), a tap makes one the big one. The round buttons download the SVG
  in these colors or replace it.

## Locks and sharing

Lock a main, companion, anchor, paper, or ink color to keep it while generating
new palettes. Changing a lock rebuilds the free colors immediately, so the
palette you see is the one its link reproduces. The same seed, locks, and
settings produce the same result with the current model.

A shared link has the form `/p/<key>`, for example `/p/1kcvtvt-c2-f5`.
The key records generation inputs rather than a fixed list of colors.
Updating the model can therefore change older links. Legacy hash links still open.

The shortlist is saved in your browser. Presentation preferences, such as the
artwork's color count, apply to shortlisted palettes too.

## SVG imports

SVG analysis runs locally in a sandboxed document. Imported styles cannot affect
the app, and scripts and external resources are blocked. Fills, strokes,
gradient stops, and typography are resolved before exporting a static vector.
Images, embedded HTML, and animation are removed; artwork should be self-contained.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space / N / ↓ / → | Next palette; Space / N makes a new set in the grid |
| ↑ / ← | Previous palette |
| V | Cycle views |
| G | Toggle grid |
| F | Star the current palette |
| S | Open the shortlist |
| C | Cycle the artwork's color count |
| 1–5 | Toggle main, companion, anchor, paper, or ink lock |
| Esc | Close settings, toggle the grid, or end the tour |
