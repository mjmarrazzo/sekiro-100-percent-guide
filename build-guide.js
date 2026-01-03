const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "sections.json");
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(__dirname, "guide.html");

if (!fs.existsSync(inputPath)) {
  console.error(`Missing input JSON at ${inputPath}`);
  process.exitCode = 1;
  return;
}

const raw = fs.readFileSync(inputPath, "utf8");
const sections = JSON.parse(raw);

const gameItemsDir = path.join(__dirname, "game-items");

const slugify = (value) => {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "section";
};

const canonicalUrl =
  process.env.GUIDE_CANONICAL_URL ??
  "https://mjmarrazzo.github.io/sekiro-100-percent-guide/";

const seoTitle = "Sekiro 100% Guide Checklist";
const sectionNames = sections
  .map((section) => section.name)
  .filter((name) => typeof name === "string" && name.trim().length > 0);
const totalSections = sections.length;
const totalBlocks = sections.reduce(
  (sum, section) => sum + (Array.isArray(section.blocks) ? section.blocks.length : 0),
  0
);
const seoDescription = sectionNames.length
  ? `Sekiro 100% completion checklist covering ${sectionNames.slice(0, 3).join(
      ", "
    )} and every other milestone in ${totalSections} collapsible sections with ${totalBlocks} task blocks.`
  : `Sekiro 100% completion checklist organized across ${totalSections} collapsible sections and ${totalBlocks} task blocks.`;
const seoKeywords = [
  "Sekiro 100%",
  "Sekiro guide",
  "Sekiro checklist",
  "Sekiro walkthrough",
  "Sekiro completion",
  "playthrough checklist",
  "Sekiro tips",
].join(", ");

const structuredDataSteps = sections.slice(0, 8).map((section, index) => ({
  "@type": "HowToStep",
  name: section.name ?? `Section ${index + 1}`,
  position: index + 1,
  url: `${canonicalUrl}#${slugify(section.name ?? "section")}-${index + 1}`,
}));
const structuredData = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: seoTitle,
  description: seoDescription,
  url: canonicalUrl,
  author: {
    "@type": "Organization",
    name: "Sekiro 100% Guide Checklist",
  },
  step: structuredDataSteps,
};
const structuredDataJson = JSON.stringify(structuredData);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const loadLinkables = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath).filter((file) => file.endsWith(".json"));
  const pairs = [];

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    try {
      const content = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      Object.entries(content).forEach(([name, url]) => {
        if (typeof name === "string" && typeof url === "string") {
          pairs.push({ name, url });
        }
      });
    } catch (error) {
      // Skip malformed files; keep build resilient.
    }
  });

  return pairs;
};

const createLinkifier = (entries) => {
  const normalized = entries
    .filter((entry) => entry.name && entry.url)
    .map((entry) => ({
      name: entry.name.trim(),
      url: entry.url.trim(),
    }))
    .filter((entry) => entry.name.length > 0 && entry.url.length > 0);

  if (normalized.length === 0) {
    return (text) => escapeHtml(text);
  }

  const lookup = new Map();
  normalized.forEach((entry) => {
    const key = entry.name.toLowerCase();
    if (!lookup.has(key)) {
      lookup.set(key, entry.url);
    }
  });

  const alternation = normalized
    .map((entry) => entry.name)
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeRegExp(name))
    .join("|");

  const regex = new RegExp(`(^|[^A-Za-z0-9])(${alternation})(?=$|[^A-Za-z0-9])`, "gi");

  return (text) => {
    let result = "";
    let lastIndex = 0;

    for (const match of text.matchAll(regex)) {
      const fullMatch = match[0];
      const prefix = match[1] ?? "";
      const matchedText = match[2] ?? "";
      const matchIndex = match.index ?? 0;

      const nameStart = matchIndex + prefix.length;
      const nameEnd = nameStart + matchedText.length;

      result += escapeHtml(text.slice(lastIndex, matchIndex));
      result += escapeHtml(prefix);

      const url = lookup.get(matchedText.toLowerCase());
      if (url) {
        result += `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(
          matchedText
        )}</a>`;
      } else {
        result += escapeHtml(matchedText);
      }

      lastIndex = nameEnd;
    }

    result += escapeHtml(text.slice(lastIndex));
    return result;
  };
};

const linkify = createLinkifier(loadLinkables(gameItemsDir));

const toSegments = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [{ type: "text", text: String(value) }];
};

const renderSegmentText = (text) => linkify(text).replace(/\n/g, "<br>");

const renderSegments = (segments) =>
  segments
    .map((segment) => {
      const html = renderSegmentText(segment.text ?? "");
      if (segment.type === "spoiler") {
        return `
          <span class="spoiler" data-spoiler data-revealed="false">
            <button type="button" class="spoiler-toggle" aria-expanded="false">Show spoiler</button>
            <span class="spoiler-text" aria-hidden="true">${html}</span>
          </span>
        `;
      }
      return html;
    })
    .join("");

const splitSegmentsIntoParagraphs = (segments) => {
  const paragraphs = [[]];
  segments.forEach((segment) => {
    const text = segment.text ?? "";
    let cursor = 0;
    while (cursor < text.length) {
      const breakIndex = text.indexOf("\n\n", cursor);
      if (breakIndex === -1) {
        paragraphs[paragraphs.length - 1].push({
          type: segment.type,
          text: text.slice(cursor),
        });
        break;
      }
      const before = text.slice(cursor, breakIndex);
      if (before.length > 0) {
        paragraphs[paragraphs.length - 1].push({
          type: segment.type,
          text: before,
        });
      }
      paragraphs.push([]);
      cursor = breakIndex + 2;
    }
  });

  return paragraphs.filter((paragraph) =>
    paragraph.some((segment) => (segment.text ?? "").trim().length > 0)
  );
};

const renderParagraphsFromSegments = (segments) =>
  splitSegmentsIntoParagraphs(segments)
    .map((paragraph) => `<p>${renderSegments(paragraph)}</p>`)
    .join("");

const renderList = (items, sectionIndex, blockIndex, pathParts = []) => {
  const listItems = items
    .map((item, index) => {
      const currentPath = [...pathParts, index];
      const key = `s${sectionIndex}-b${blockIndex}-i${currentPath.join("-")}`;
      const nestedItems = typeof item === "string" ? [] : item.items ?? [];
      const content =
        typeof item === "string"
          ? [{ type: "text", text: item }]
          : toSegments(item.content ?? item.text);
      const hasText = content.some((segment) => (segment.text ?? "").trim().length > 0);

      let html = "<li>";
      html += `<label class="item${hasText ? "" : " item-empty"}">`;
      html += `<input type="checkbox" data-check="${key}">`;
      if (hasText) {
        html += `<span class="item-text">${renderSegments(content)}</span>`;
      }
      html += "</label>";

      if (nestedItems.length > 0) {
        html += renderList(nestedItems, sectionIndex, blockIndex, currentPath);
      }

      html += "</li>";
      return html;
    })
    .join("");

  return `<ul>${listItems}</ul>`;
};

const renderBlocks = (blocks, sectionIndex) =>
  blocks
    .map((block, blockIndex) => {
      if (block.type === "text") {
        const segments = toSegments(block.content ?? block.text);
        if (segments.length === 0) {
          return "";
        }
        return `<div class="block text">${renderParagraphsFromSegments(segments)}</div>`;
      }
      if (block.type === "list") {
        const items = Array.isArray(block.items) ? block.items : [];
        if (items.length === 0) {
          return "";
        }
        return `<div class="block list">${renderList(items, sectionIndex, blockIndex)}</div>`;
      }
      return "";
    })
    .join("");

const htmlSections = sections
  .map((section, index) => {
    const name = section.name ?? "";
    const blocks = Array.isArray(section.blocks) ? section.blocks : [];
    const slug = `${slugify(name)}-${index + 1}`;
    return `
      <details class="section" id="${slug}">
        <summary>
          <span class="section-title">${escapeHtml(name)}</span>
        </summary>
        <div class="section-body">
          ${renderBlocks(blocks, index)}
        </div>
      </details>
    `;
  })
  .join("");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(seoDescription)}">
    <meta name="keywords" content="${escapeHtml(seoKeywords)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(seoTitle)}">
    <meta property="og:description" content="${escapeHtml(seoDescription)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtml(seoTitle)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(seoTitle)}">
    <meta name="twitter:description" content="${escapeHtml(seoDescription)}">
    <title>${escapeHtml(seoTitle)}</title>
    <script type="application/ld+json">
${structuredDataJson}
    </script>
    <style>
      :root {
        --paper: #f4efe4;
        --paper-deep: #ebe3d5;
        --ink: #1f2a33;
        --muted: #4b5563;
        --accent: #2f7f79;
        --accent-soft: #d5ebe7;
        --border: #d9cdbb;
        --shadow: 0 18px 40px rgba(32, 40, 46, 0.12);
        --link: #2f7f79;
        --link-strong: #1f5e59;
        --font-body: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
        --font-heading: "Georgia", "Times New Roman", serif;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --paper: #0f1720;
          --paper-deep: #0a1018;
          --ink: #e5ecf4;
        --muted: #b8c2cc;
        --accent: #8dd4d3;
        --accent-soft: #1e2f38;
        --border: #24303d;
        --shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        --link: #c5f1f0;
        --link-strong: #9ce4e4;
        --font-body: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
        --font-heading: "Georgia", "Times New Roman", serif;
      }
      }

      :root[data-theme="light"] {
        --paper: #f4efe4;
        --paper-deep: #ebe3d5;
        --ink: #1f2a33;
        --muted: #4b5563;
        --accent: #2f7f79;
        --accent-soft: #d5ebe7;
        --border: #d9cdbb;
        --shadow: 0 18px 40px rgba(32, 40, 46, 0.12);
      }

      :root[data-theme="dark"] {
        --paper: #0c1018;
        --paper-deep: #080c12;
        --ink: #f0f4fb;
        --muted: #c8d1dd;
        --accent: #9ce4e4;
        --accent-soft: #163040;
        --border: #1f2a37;
        --shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
        --link: #c5f1f0;
        --link-strong: #9ce4e4;
        --font-body: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
        --font-heading: "Georgia", "Times New Roman", serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: var(--font-body);
        color: var(--ink);
        background:
          radial-gradient(circle at 10% 20%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 45%),
          radial-gradient(circle at 90% 10%, color-mix(in srgb, #f8deb4 25%, transparent), transparent 40%),
          linear-gradient(180deg, var(--paper), var(--paper-deep));
        min-height: 100vh;
      }

      .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 28px 18px 80px;
      }

      a {
        color: var(--link);
        text-decoration-thickness: 2px;
        text-decoration-color: color-mix(in srgb, var(--link) 80%, transparent);
      }

      a:hover {
        color: var(--link-strong);
        text-decoration-color: var(--link-strong);
      }

      .hero {
        background: color-mix(in srgb, var(--paper) 88%, #fff 12%);
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 20px 18px 18px;
        box-shadow: var(--shadow);
        display: grid;
        gap: 14px;
      }

      .hero-head {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 12px;
      }

      .hero-title h1 {
        margin: 0 0 6px;
        font-family: var(--font-heading);
        font-size: clamp(1.8rem, 3vw, 2.6rem);
      }

      .hero-title p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }

      .theme-toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: linear-gradient(135deg, var(--accent-soft), color-mix(in srgb, var(--accent) 20%, var(--accent-soft)));
        color: var(--ink);
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
      }

      .theme-toggle:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 18px rgba(0, 0, 0, 0.12);
      }

      .theme-icon {
        font-size: 1.1rem;
      }

      .hero h1 {
        font-family: var(--font-heading);
        font-size: clamp(2rem, 3vw, 2.8rem);
        margin: 0;
      }

      .hero p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .controls {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
        align-items: center;
      }

      .controls button {
        border: 1px solid var(--border);
        background: linear-gradient(135deg, var(--accent-soft), color-mix(in srgb, var(--accent) 14%, var(--accent-soft)));
        color: var(--ink);
        padding: 10px 14px;
        border-radius: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        width: 100%;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.06);
      }

      .controls button:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 18px rgba(0, 0, 0, 0.1);
      }

      .sections {
        margin-top: 20px;
        display: grid;
        gap: 16px;
      }

      details.section {
        background: color-mix(in srgb, var(--paper) 94%, #fff 6%);
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 10px 24px rgba(32, 40, 46, 0.08);
      }

      details.section summary {
        list-style: none;
        cursor: pointer;
        padding: 20px 18px 16px;
        font-family: var(--font-heading);
        font-size: 1.25rem;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      details.section summary::marker,
      details.section summary::-webkit-details-marker {
        display: none;
      }

      details.section summary:hover {
        background: rgba(47, 127, 121, 0.08);
      }

      details.section summary::after {
        content: "v";
        margin-left: auto;
        font-size: 1rem;
        transition: transform 0.2s ease;
      }

      details.section[open] summary::after {
        transform: rotate(180deg);
      }

      details.section[open] summary {
        border-bottom: 1px solid var(--border);
      }

      .section-body {
        padding: 8px 18px 20px;
        display: grid;
        gap: 16px;
      }

      .block.text p {
        margin: 0 0 12px;
        line-height: 1.7;
        color: var(--muted);
        word-break: break-word;
      }

      .block.text p:last-child {
        margin-bottom: 0;
      }

      ul {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 10px;
      }

      li {
        list-style: none;
      }

      .item {
        display: grid;
        grid-template-columns: 20px 1fr;
        gap: 10px;
        align-items: flex-start;
        word-break: break-word;
      }

      .item input[type="checkbox"] {
        width: 18px;
        height: 18px;
        margin-top: 3px;
        accent-color: var(--accent);
      }

      .item-text {
        line-height: 1.6;
      }

      .item input[type="checkbox"]:checked + .item-text {
        color: #6b7280;
        text-decoration: line-through;
        text-decoration-thickness: 2px;
      }

      .spoiler {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }

      .spoiler-toggle {
        border: 1px dashed var(--accent);
        background: rgba(47, 127, 121, 0.12);
        color: var(--accent);
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
      }

      .spoiler-text {
        display: none;
        padding: 2px 8px;
        background: rgba(47, 127, 121, 0.12);
        border-radius: 8px;
      }

      .spoiler[data-revealed="true"] .spoiler-text {
        display: inline;
      }

      .spoiler[data-revealed="true"] .spoiler-toggle {
        background: var(--accent);
        color: #fff;
        border-style: solid;
      }

      .item-empty {
        opacity: 0.4;
      }

      .block.list ul ul {
        padding-left: 22px;
        border-left: 2px dashed rgba(47, 127, 121, 0.3);
      }

      .footer {
        margin-top: 32px;
        color: var(--muted);
        text-align: center;
        font-size: 0.9rem;
      }

      @media (max-width: 720px) {
        .page {
          padding: 18px 12px 56px;
        }

        .hero {
          padding: 16px 14px;
          gap: 12px;
        }

        .hero-head {
          gap: 10px;
          grid-template-columns: 1fr auto;
        }

        .hero-title h1 {
          font-size: 1.6rem;
        }

        .theme-label {
          display: none;
        }

        .controls {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        details.section summary {
          font-size: 1.05rem;
          padding: 18px 14px 14px;
        }

        .section-body {
          padding: 8px 14px 18px;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="hero">
        <div class="hero-head">
          <div class="hero-title">
            <h1>Sekiro 100% Guide Checklist</h1>
            <p>Track each step, collapse sections, and keep your progress saved locally.</p>
          </div>
          <button type="button" class="theme-toggle" data-action="toggle-theme" aria-live="polite">
            <span class="theme-icon" aria-hidden="true">🌙</span>
            <span class="theme-label">Switch to light</span>
          </button>
        </div>
        <div class="controls">
          <button type="button" data-action="expand">Expand all</button>
          <button type="button" data-action="collapse">Collapse all</button>
          <button type="button" data-action="show-spoilers">Show spoilers</button>
          <button type="button" data-action="hide-spoilers">Hide spoilers</button>
          <button type="button" data-action="clear">Clear checks</button>
        </div>
      </header>

      <main class="sections">
        ${htmlSections}
      </main>

      <div class="footer">Progress is saved to this browser using local storage.</div>
    </div>
    <script>
      (() => {
        const storageKey = "sekiro-guide-state-v2";
        const themeStorageKey = "sekiro-guide-theme";
        const details = Array.from(document.querySelectorAll("details.section"));
        const checkboxes = Array.from(
          document.querySelectorAll('input[type="checkbox"][data-check]')
        );

        const legacyStorageKey = "sekiro-guide-checks-v1";

        const loadState = () => {
          try {
            const stored = localStorage.getItem(storageKey);
            const parsed = stored ? JSON.parse(stored) : (() => {
              const legacy = localStorage.getItem(legacyStorageKey);
              return legacy ? JSON.parse(legacy) : {};
            })();
            const isLegacy =
              parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
              Object.values(parsed).every((value) => typeof value === "boolean");

            if (isLegacy) {
              return { checks: parsed, sections: {} };
            }

            const checks = parsed && typeof parsed.checks === "object" ? parsed.checks : {};
            const sections = parsed && typeof parsed.sections === "object" ? parsed.sections : {};
            return { checks, sections };
          } catch (error) {
            return { checks: {}, sections: {} };
          }
        };

        const saveState = (state) => {
          localStorage.setItem(storageKey, JSON.stringify(state));
        };

        let state = loadState();
        if (!state.checks) state.checks = {};
        if (!state.sections) state.sections = {};

        checkboxes.forEach((input) => {
          const key = input.dataset.check;
          if (state.checks[key]) {
            input.checked = true;
          }

          input.addEventListener("change", () => {
            if (input.checked) {
              state.checks[key] = true;
            } else {
              delete state.checks[key];
            }
            saveState(state);
          });
        });

        details.forEach((section) => {
          const id = section.id;
          const stored = state.sections[id];
          if (stored === undefined) {
            section.open = true;
          } else {
            section.open = !!stored;
          }

          section.addEventListener("toggle", () => {
            state.sections[id] = section.open;
            saveState(state);
          });
        });

        const setAllSections = (open) => {
          details.forEach((section) => {
            section.open = open;
            state.sections[section.id] = open;
          });
          saveState(state);
        };

        document.querySelector('[data-action="expand"]')?.addEventListener("click", () => {
          setAllSections(true);
        });
        document.querySelector('[data-action="collapse"]')?.addEventListener("click", () => {
          setAllSections(false);
        });
        document.querySelector('[data-action="clear"]')?.addEventListener("click", () => {
          state = { checks: {}, sections: {} };
          saveState(state);
          checkboxes.forEach((input) => {
            input.checked = false;
          });
          details.forEach((section) => {
            section.open = true;
            state.sections[section.id] = true;
          });
          saveState(state);
        });

        const spoilerNodes = Array.from(document.querySelectorAll("[data-spoiler]"));
        const setSpoilers = (revealed) => {
          spoilerNodes.forEach((node) => {
            node.dataset.revealed = revealed ? "true" : "false";
            const button = node.querySelector(".spoiler-toggle");
            const text = node.querySelector(".spoiler-text");
            if (button) {
              button.textContent = revealed ? "Hide spoiler" : "Show spoiler";
              button.setAttribute("aria-expanded", revealed ? "true" : "false");
            }
            if (text) {
              text.setAttribute("aria-hidden", revealed ? "false" : "true");
            }
          });
        };

        spoilerNodes.forEach((node) => {
          const button = node.querySelector(".spoiler-toggle");
          if (!button) {
            return;
          }
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const isRevealed = node.dataset.revealed === "true";
            const next = !isRevealed;
            node.dataset.revealed = next ? "true" : "false";
            button.textContent = next ? "Hide spoiler" : "Show spoiler";
            button.setAttribute("aria-expanded", next ? "true" : "false");
            const text = node.querySelector(".spoiler-text");
            if (text) {
              text.setAttribute("aria-hidden", next ? "false" : "true");
            }
          });
        });

        document
          .querySelector('[data-action="show-spoilers"]')
          ?.addEventListener("click", () => {
            setSpoilers(true);
          });
        document
          .querySelector('[data-action="hide-spoilers"]')
          ?.addEventListener("click", () => {
            setSpoilers(false);
          });

        const themeButton = document.querySelector('[data-action="toggle-theme"]');
        const themeIcon = () => themeButton?.querySelector(".theme-icon");
        const themeLabel = () => themeButton?.querySelector(".theme-label");
        const getPreferredTheme = () =>
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";

        const applyTheme = (theme) => {
          document.documentElement.setAttribute("data-theme", theme);
          if (themeButton) {
            const label = themeLabel();
            const icon = themeIcon();
            if (label) {
              label.textContent = theme === "dark" ? "Switch to light" : "Switch to dark";
            }
            if (icon) {
              icon.textContent = theme === "dark" ? "🌙" : "☀️";
            }
            themeButton.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
          }
        };

        const storedTheme = localStorage.getItem(themeStorageKey);
        const initialTheme = storedTheme === "light" || storedTheme === "dark"
          ? storedTheme
          : getPreferredTheme();
        applyTheme(initialTheme);

        themeButton?.addEventListener("click", () => {
          const current = document.documentElement.getAttribute("data-theme") || initialTheme;
          const next = current === "dark" ? "light" : "dark";
          applyTheme(next);
          localStorage.setItem(themeStorageKey, next);
        });
      })();
    </script>
  </body>
</html>
`;

fs.writeFileSync(outputPath, html);
console.log(`Wrote ${outputPath}`);
