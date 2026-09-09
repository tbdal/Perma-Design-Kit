# Perma Design Kit

A tool for designing permaculture polycultures — composing plants by their ecological functions, human uses, and site conditions, and printing them as physical plant cards.

## Quickstart (PWA)

The PWA is the primary interface. It runs in the browser, works offline, and can be installed on desktop and mobile.

```
cd pwa
npm install
npm run dev     # in a second terminal: npm run proxy (needed for PFAF enrichment)
```

For deployment and proxy setup see [`pwa/SETUP.md`](pwa/SETUP.md).

### Features

- **Plant management** — create, edit, search and import plants with ~50 attributes
- **Multi-source import** — Wikidata autocomplete, enrichment via PFAF proxy (NaturaDB currently disabled, see `ROADMAP.md`)
- **Per-field provenance** — each data point is tagged with its source (Wikidata / PFAF / NaturaDB / manual / CSV)
- **Card preview** — live canvas preview of poly cards (70×120 mm) and stripe cards (290×17 mm)
- **PDF export** — print-ready A4 layout, compatible with LibreWolf/Firefox/Chrome
- **Bulk operations** — list view with checkboxes, bulk delete / JSON / CSV / PDF export
- **CSV import/export** — round-trip compatible format
- **PWA / Offline** — service worker, installable

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the current state and planned features.

## Legacy (PowerShell)

The original PowerShell-based workflow is preserved in [`legacy/`](legacy/) for reference.
It is no longer actively developed. See [`legacy/README.md`](legacy/README.md) for migration notes.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit with descriptive messages
4. Open a pull request

## License

Copyright (c) 2024 Sebastian Schucht

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Authors

- Sebastian Schucht <sebastian@schucht.eu>
- Jörn Müller <post@permagruen.de> — [permagruen.de](https://www.permagruen.de)
