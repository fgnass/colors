# Color name sources

- `meodai-color-names.json` — [meodai/color-names](https://github.com/meodai/color-names) v14.77.0 (`color-name-list` on npm), MIT. The names we use.
- `many-languages-en.json` — [meodai/many-languages-many-colors-dataset-lists](https://github.com/meodai/many-languages-many-colors-dataset-lists), English list, MIT. Only used to filter.

A meodai name is kept if it has one or two words and one of its words is a
single-word color name from the English list. See `scripts/names.mjs`.
