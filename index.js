const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://steamcommunity.com/sharedfiles/filedetails/?id=2952524257", {
    waitUntil: "domcontentloaded",
  });

  await page.waitForSelector("div.subSection.detailBox .subSectionTitle");

  const sections = await page.evaluate(() => {
    const SPOILER_START = "[[SPOILER_START]]";
    const SPOILER_END = "[[SPOILER_END]]";
    const normalizeTextBlock = (value) => {
      let text = value.replace(/\r/g, "");
      text = text.replace(/[ \t]+/g, " ");
      text = text.replace(/ *\n */g, "\n");
      text = text.replace(/\n{3,}/g, "\n\n");
      return text.trim();
    };

    const isList = (node) =>
      node?.nodeType === Node.ELEMENT_NODE && (node.tagName === "UL" || node.tagName === "OL");
    const isSpoiler = (node) =>
      node?.nodeType === Node.ELEMENT_NODE && node.classList.contains("bb_spoiler");

    const collectText = (node, parts) => {
      if (!node || isList(node)) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent ?? "");
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      if (node.tagName === "BR") {
        parts.push("\n");
        return;
      }

      if (isSpoiler(node)) {
        parts.push(SPOILER_START);
        node.childNodes.forEach((child) => collectText(child, parts));
        parts.push(SPOILER_END);
        return;
      }

      node.childNodes.forEach((child) => collectText(child, parts));
    };

    const mergeSegments = (segments) => {
      const merged = [];
      for (const segment of segments) {
        if (!segment.text) {
          continue;
        }
        const last = merged[merged.length - 1];
        if (last && last.type === segment.type) {
          last.text += segment.text;
        } else {
          merged.push({ ...segment });
        }
      }
      return merged;
    };

    const splitSpoilers = (text) => {
      const segments = [];
      let cursor = 0;
      while (cursor < text.length) {
        const start = text.indexOf(SPOILER_START, cursor);
        if (start === -1) {
          segments.push({ type: "text", text: text.slice(cursor) });
          break;
        }
        const before = text.slice(cursor, start);
        if (before) {
          segments.push({ type: "text", text: before });
        }
        const end = text.indexOf(SPOILER_END, start + SPOILER_START.length);
        if (end === -1) {
          segments.push({ type: "text", text: text.slice(start) });
          break;
        }
        const spoilerText = text.slice(start + SPOILER_START.length, end);
        if (spoilerText) {
          segments.push({ type: "spoiler", text: spoilerText });
        }
        cursor = end + SPOILER_END.length;
      }
      return mergeSegments(segments);
    };

    const segmentsFromParts = (parts) => {
      const text = normalizeTextBlock(parts.join(""));
      if (!text) {
        return [];
      }
      return splitSpoilers(text);
    };

    const extractListItem = (li) => {
      const parts = [];
      li.childNodes.forEach((node) => {
        if (!isList(node)) {
          collectText(node, parts);
        }
      });

      const nestedLists = Array.from(li.children).filter(
        (child) => child.tagName === "UL" || child.tagName === "OL"
      );
      const nestedItems = nestedLists.flatMap((nested) => extractListItems(nested));
      const content = segmentsFromParts(parts);

      if (nestedItems.length > 0) {
        return { content, items: nestedItems };
      }

      return { content, items: [] };
    };

    const extractListItems = (listNode) =>
      Array.from(listNode.children)
        .filter((child) => child.tagName === "LI")
        .map((li) => extractListItem(li))
        .filter((item) => {
          if (!item) {
            return false;
          }
          const hasContent = item.content?.some((segment) => segment.text.length > 0);
          return hasContent || item.items.length > 0;
        });

    return Array.from(document.querySelectorAll("div.subSection.detailBox")).map((section) => {
      const name = section.querySelector(".subSectionTitle")?.innerText ?? "";
      const desc = section.querySelector(".subSectionDesc");
      const blocks = [];
      let textParts = [];

      const flushText = () => {
        const content = segmentsFromParts(textParts);
        if (content.length > 0) {
          blocks.push({ type: "text", content });
        }
        textParts = [];
      };

      if (desc) {
        desc.childNodes.forEach((node) => {
          if (isList(node)) {
            flushText();
            blocks.push({ type: "list", items: extractListItems(node) });
          } else {
            collectText(node, textParts);
          }
        });
      }

      flushText();

      return {
        name: normalizeTextBlock(name),
        blocks,
      };
    });
  });

  const outputPath = path.join(__dirname, "sections.json");
  fs.writeFileSync(outputPath, JSON.stringify(sections, null, 2));
  console.log(`Wrote ${outputPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
