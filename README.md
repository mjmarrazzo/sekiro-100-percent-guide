# Sekiro 100% Guide Checklist

This project generates a single-page checklist that mirrors the Steam Community walkthrough at <https://steamcommunity.com/sharedfiles/filedetails/?id=2952524257>. The generator (`build-guide.js`) pulls structured sections from `sections.json`, styles the experience, and outputs `guide.html` so you can track every step of a 100% Sekiro playthrough with collapsible sections, persistent checks, and spoiler toggles.

## Usage

- `node index.js` fetches the original guide content via Playwright and rewrites `sections.json`. Run this only when the source guide content changes and you need to refresh the data.
- `node build-guide.js` compiles the JSON data into `guide.html`, injecting the visual styles, controls, and scripts. Any change to `build-guide.js`, `sections.json`, or linked assets requires rerunning this command.
- Open `guide.html` in a browser (desktop or mobile) or use the Playwright MCP browser to verify layout and interactive behavior.

## Development Notes

- Styling is fully inlined inside `build-guide.js`; keep CSS organized with base variables at the top and responsive tweaks near the end.
- JavaScript follows CommonJS patterns with 2-space indentation and descriptive helper functions (`renderBlocks`, `renderSegments`, etc.).
- Generated IDs follow `s{section}-b{block}-i{item}` so state can be tracked via localStorage.
- Skip editing `guide.html` directly—always rebuild from source to keep versions consistent.

## Inspiration

This checklist is inspired by the Steam Community guide linked above. When you rebuild, the scraper (`index.js`) keeps your copy aligned with the latest publicly shared walkthrough entries that the original author curated. Respect their work and don’t copy it elsewhere without permission.
