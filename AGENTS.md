# Repository Guidelines

## Project Structure & Module Organization
`build-guide.js` is the single source that compiles `sections.json` (scraped via `index.js`) into the hand-crafted `guide.html`. Keep section data under `sections.json` and supplemental links under `game-items/`. The generated `guide.html` is the deployable artifact; avoid editing it directly—always modify templates or data and rerun the build script so the output stays in sync.

## Build, Test, and Development Commands
- `node index.js` — scrapes the Sekiro guide page using Playwright and rewrites `sections.json`; only run when section content needs refreshing.
- `node build-guide.js` — runs the template generator, injecting styles/scripts and writing `guide.html`. Rebuild every time you change styles, layout, or data.
- `npx playwright install` — needed the first time you run Playwright operations locally (scraping or visual verification).
Use `node build-guide.js --help`? (none currently). When you regenerate, manually inspect `guide.html` in a browser or via the Playwright MCP browser to confirm the experience.

## Coding Style & Naming Conventions
JavaScript lives in CommonJS modules with 2-space indentation and template literals for HTML fragments. Keep helper functions near the top, guard file I/O (`fs.existsSync`), and prefer descriptive consts (e.g., `renderBlocks`). CSS is inlined inside `build-guide.js`; keep responsive rules near the bottom. Use camelCase for identifiers within scripts and kebab-case for generated IDs (`section-title`, `s1-b2-i3`).

## Testing Guidelines
There are no automated tests. Validate changes by rebuilding (`node build-guide.js`) and manually checking `guide.html` in a browser viewport that mimics mobile/desktop. Use the Playwright MCP browser to grab a quick screenshot or ensure buttons function if you prefer scripted verification. Document any manual QA steps in the PR description.

## Commit & Pull Request Guidelines
Write focused commits that describe what changed (e.g., “Adjust link palettes for dark theme”). Mention regenerated artifacts (`guide.html`) when the build output changes. Pull requests should include:
1. A brief summary of changes.
2. Confirmation that `node build-guide.js` was run when relevant.
3. Any new assets or scripts added (e.g., updates to Playwright usage).
4. Screenshots if visual tweaks were involved.

## Additional Notes
Because `guide.html` is generated, avoid editing it directly—always update `build-guide.js` or `sections.json`. If you need to extend interactivity (spoilers, theme toggles), keep behavior contained in the inline `<script>` and rerun the build so the HTML stays consistent.
