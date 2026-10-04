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

By submitting a contribution, you agree that it is published under this repository's license (FSL-1.1-MIT, see below).

## License

The Perma Design Kit is **fair source**: published under the [Functional Source License 1.1, MIT Future License](LICENSE.md) (FSL-1.1-MIT).

- You may use, copy, modify and redistribute the code for any purpose **except a competing commercial product or service**, i.e. offering it (or something substantially similar built from it) to others for money.
- Internal use, non-commercial education and research, and consulting are explicitly allowed; so is hosting a free, non-commercial instance.
- Plant cards, PDFs and garden plans you create with the app are yours, including for commercial use.
- Every version automatically becomes **MIT-licensed two years after it was published**.

Versions published before the switch (the commit tagged `fsl-start`, 2026-10-04) remain MIT-licensed, and so does the PowerShell tooling in `legacy/`. Details and the retained MIT notice are in [`NOTICE`](NOTICE). Data sources, fonts and dependencies keep their own licenses.

## Authors

- **Andreas Linder** ([@tbdal](https://github.com/tbdal)) — Perma Design Kit PWA
- **Jörn Müller** ([@permagruen](https://github.com/permagruen), [permagruen.de](https://www.permagruen.de)) — plant lists, help texts, roadmap

## Based on

- [PermacultureTreeGuildsDesigner](https://github.com/SZzip/PermacultureTreeGuildsDesigner) by Sebastian Schucht ([@SZzip](https://github.com/SZzip)) — the original PowerShell tooling, preserved in `legacy/`
- [Perma-Guild-Forge](https://github.com/js32/Perma-Guild-Forge) by Jens Steger ([@js32](https://github.com/js32)) — PWA foundations
