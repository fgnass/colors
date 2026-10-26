# Colors

How it works, rule by rule, with the exceptions marked: [`docs/algorithm.html`](docs/algorithm.html) (`npm run dev`, then `/docs/algorithm.html`).

A palette generator for interfaces. It samples five-color palettes from a
statistical model fitted to one set of hand-picked palettes (309 editorial
color combinations), plus a small sample of near-whites and near-blacks (36).
The hue families come from the English basic color terms; scale drift and
gradients are rules and constants.
No color is hard-coded: the model holds only distributions
(`src/core/params.json`). The dataset in
`data/` is a perturbed copy of the measurements: about a third of the colors
are moved a little (lightness, hue, relative chroma; ΔE ≈ 1), at least one in
every palette, so no palette is an original, while the statistics the model
is fitted to stay the same.

```sh
npm install
npm run dev     # the app
npm test        # fidelity test: generated vs. dataset statistics
npm run fit     # refit src/core/params.json from data/ (needs uv)
npm run shapes  # split data/shapes/*.svg into fillable pieces -> src/shapes.ts
npm run names   # filter the color name lists in data/names -> public/colornames.txt
```

## Links and previews

A link to a palette is `/p/<colors>#<key>`. The key remakes the palette in the
app; the path holds its colors and artwork as shown (`src/share.ts`). If the
model makes other colors from a key, the app locks the colors of the link.
On Cloudflare Pages, `functions/` gives such a link its preview: `/p/*` adds
the Open Graph tags to the page, `/og/<colors>.png` draws the image
(`src/og.ts`, made a PNG with resvg; Piazzolla instances in `public/fonts/`).

```sh
npm run pages   # the build with the functions (wrangler), on :8796
npm run deploy  # to Cloudflare Pages
```

## The model

Every palette has five roles:

| Role | What the data shows |
|---|---|
| **main** | mid lightness, usually the most chromatic color |
| **companion** | any hue, but a similar weight (lightness, chroma) to the main |
| **anchor** | the lightness pole; often off-white, cream or near-black |
| **light / dark** | tints of the main, same hue, slightly less chroma |

- **Hue is free.** Hue distances between roles are indistinguishable from
  random. The main hue follows the dataset's hue preference, conditioned on
  lightness (light → yellows, dark → blues and reds).
- **Structure is in lightness and chroma.** Lightness and relative chroma
  (share of the in-gamut maximum) of main, companion and anchor come from a
  Gaussian copula: empirical marginals plus their correlation matrix. Locked
  colors are handled by conditional sampling.
- **Structural rules** the correlations don't capture (rarely two neutrals,
  the anchor is the lightness pole) are applied by rejection sampling.
- **Limits:** a chroma ceiling (≈ 0.24 OKLCH, the palettes' 99th percentile);
  no pure black or white: lightness and tint of near-neutrals follow the
  sampled near-blacks and near-whites (cool darks, warm lights).
- **Mood:** one setting from muted to vivid that stays inside the dataset.
  It moves each color's relative chroma within its measured distribution
  (the copula marginal) by shifting the normal score the color was drawn
  with: the muted end reaches the dataset's least vivid palettes (strongest
  chroma ≈ its 10th percentile, not greyer) and widens the lightness range a
  little, as those palettes do; the vivid end reaches its most vivid ones.
  Toward vivid, only one or two accents move up (toward the cusp of their
  hue, neon at the end) and the others move down a little, so at most two
  colors are vivid, as in the data. The mood is applied to a palette drawn
  without it and every color moves continuously with it: the setting only
  makes colors more or less vivid, canvases and artwork stay.
- **Hue families:** "a palette with blue in it". The model is conditioned on
  containing a clearly colored main, companion or anchor of that family, by
  rejection sampling, so any role can carry it. The families are the English
  basic color terms (Many Languages, Many Colors, by frequency) that are
  clearly colored and at least 20° apart, at the hue of their typical color:
  red, orange, yellow, green, teal, blue, purple, pink. Two families make a two-hue palette: every clearly colored color is of one
  of them, each in its own color; the same family twice means monochrome
  (every clearly colored color of that family). Neutrals are allowed in both.
  Toward vivid, the families' colors are the first accents.
- **Canvases:** paper (light) and ink (dark) are sampled per palette. Their
  tint comes from one source — grey, cream, cool, warm or the main/companion
  hue — with the probabilities and distributions of the palettes' near-whites
  and near-blacks and the sampled ones. A cream, cool or warm tint takes the nearest hue of a
  colored palette color, so paper, ink and the neutral scale stay in the
  palette's family. Paper lightness is mapped from the
  measured span (down to ~0.9) into 0.96–0.99, light enough for an app
  background.

## Derived UI material

- **Scales 50–950**: a color sits at the step of its lightness, but a
  colorful one needs paler steps above it (at least 1 + 2 × chroma / cusp
  chroma), so a vivid lime sits at 300, a trace of cyan at 100, never at 50;
  the lightness curve and the chroma profile bend around it. Otherwise a fixed
  perceptual lightness curve, a chroma profile
  that falls off toward white, and a hue drift by rule, with no data: every
  hue is most colorful at its own lightness (the cusp of the sRGB gamut), and
  a color that darkens turns toward the neighbouring hue whose cusp is darker,
  one that lightens toward the lighter one, so it keeps its color instead of
  turning muddy (yellow darkens toward orange and brown, blue toward indigo
  and lightens toward sky). The drift follows the slope of the cusp lightness
  over hue, weighted by the height of the cusp (a hue with a high cusp, like
  yellow, can't be colorful when dark and turns; purple, blue and red stay
  colorful and barely turn), compressed to at most 80° per unit of lightness. On top, the dark steps
  (below L 0.6) lean toward the palette's darkest colored color, so a scale
  darkens into the palette's own dark (red into plum next to a purple)
  rather than into brown; only toward a neighbouring hue (full up to 60°,
  none from 120°), since a mix across the color circle passes through grey.
- **Neutral scale** from ink to paper, with the tint interpolated in OKLab so a
  cool ink and a cream paper meet in grey (not in olive).
- **Light / dark themes**: the most colorful palette color is the loud one and
  appears only in small fills (main action, logo, badge, today's bar, toggle),
  always as itself, with text in a dark shade of the second color's hue. Its
  own tint is the second data series and the toggle knob; the next color,
  darkened in its hue until white text reads, marks tags and the avatar.
  Light background: a light, almost neutral palette color
  when there is one, with cards near white in its hue; else `neutral-100`
  (tinted by the palette) with white cards. A dark palette color that
  is neither the loud nor the second color fills the secondary button, the same
  in both modes. In dark mode the background is a deep version (L 0.2) of the
  darkest colored palette color (C ≥ 0.04), else the darkest neutral
  (`neutral-950`), with cards a little lighter.
- **Gradient**: one fixed composition (`COMPOSITION` in
  `src/core/gradient.ts`): the bottom color as a field, the glow color above a
  soft U-shaped edge (deepest left of the middle, flat), the top color as a
  band with a soft lower edge that falls to the left and curves toward the
  sides, composited in sRGB; a soft edge is a Gaussian-blurred edge,
  opacity = Φ(distance / blur).
  The stops are the palette's own colors: the glow is the most colorful
  color that stands out (vivid, C ≥ 0.12, or 0.12 lighter than the darkest
  colored one); the band is a dark colored one, preferring a color with body
  (L 0.22–0.6) over a near-black; the field is the lightest of the rest. A
  neon that is the lightest by far becomes the field when another vivid color
  can glow above it. A vivid mood
  gives a vivid gradient.
- **Colors 2 / 3 / 4** (the plates' switch) picks the palette colors in use,
  the same everywhere: the plate's (main + its fill colors). The gradient is
  built from exactly those (with 2, the missing stop is a deep or pale step of
  the glow; with 4, the color left over turns the field into a second field);
  the interface counts its neutral background as one color: with 2 it is the
  loud color on neutrals, with 3 and 4 one or two more palette colors go into
  the chart's data series (tags, avatar and secondary button stay neutral);
  your SVG uses the same colors.
- **Gradient as CSS**: the model is drawn with two radial gradients over the
  bottom color, at ΔE ≈ 0.2 from the exact model. Near its vertex, an
  ellipse's edge is a parabola with curvature ry / (2 rx²): the glow is a tall
  ellipse above the U, the band the outside of a tall ellipse below its edge;
  the soft edges are stops whose opacity follows Φ.
- **Export** as CSS variables (the gradient as `--brand-gradient`), Tailwind v4
  `@theme` (the gradient as `--background-image-brand`, i.e. `bg-brand`) or JSON.

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

## Plates

Each palette is shown as a plate with one tile shape. The shape is drawn
from all shapes, so changing the number of colors keeps it whenever it has
enough parts. The shapes are split
into pieces that can be filled separately: a subpath is a hole if a point
inside it is not filled by the whole path (nonzero rule), and holes stay with
the smallest piece around them. With 3 or 4 colors, only shapes with enough
pieces are used; pieces are colored largest first, each with the least used
color its neighbours don't have.
One-piece shapes, and a few multi-piece shapes built on a 2 × 2 grid, are
split into parts instead — quadrants, or rows for
shapes built from bands. Each part is drawn in a nested `<svg>` that clips to
it, and parts sharing an edge count as neighbours. Shapes whose cuts would
slice a continuous form are excluded by hand. Rings of circles are rebuilt
as whole circles that overlap like a chain, each on top of the next.

## Layout

```
data/            the palettes and near-neutrals (input of the fit), sources of the shapes and color names
scripts/fit.py   fits src/core/params.json
scripts/*.mjs    build src/shapes.ts and public/colornames.txt
src/core/        framework-free generator (color math, copula, palette, ramps, tokens, gradients, names)
src/svg.ts       finds the colors of a pasted SVG and recolors it
src/main.ts      the app
```

## Color names

Each color gets the name of the nearest named color (OKLab) from
[meodai/color-names](https://github.com/meodai/color-names), filtered to names
of one or two words where one word is a basic color word from the English
"Many Languages, Many Colors" list. Names stay unique within a palette.

## Credits

- Tile shapes: [SVG Shapes](https://www.shapes.gallery) by Monika Michalczyk.
- Icons: shapes, sun, moon, image, swatch book and grid from [Lucide](https://lucide.dev) (ISC).
- Color names: [meodai/color-names](https://github.com/meodai/color-names) (MIT); filtered with the English list of [Many Languages, Many Colors](https://github.com/meodai/many-languages-many-colors-dataset-lists) (MIT).
