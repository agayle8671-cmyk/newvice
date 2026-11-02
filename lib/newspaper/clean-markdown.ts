import type { Block, CategorySlug } from "./types";

export const CATEGORY_MAP: Record<string, CategorySlug> = {
  "story & campaign": "story",
  "story": "story",
  "map & locations": "leonida",
  "leonida": "leonida",
  "vehicles & weapons": "vehicles-weapons",
  "online & features": "in-game-media",
  "trailers & media": "trailers-media",
  "leaks & rumors": "leaks-rumors",
  "guides & walkthroughs": "story",
  "tech & rage": "tech-rage",
};

/**
 * Removes internal prompt leakage, meta-labels ('Block 1', 'Block 2'),
 * critique checklists, and technical notes so the text reads like pristine broadsheet journalism.
 */
export function cleanPolishedMarkdown(raw: string): string {
  if (!raw) return "";

  let cleaned = raw
    // Strip internal prompt/critique notes and leak lines
    .replace(/^\[(CHIEF VANCE|SGT\. CRUZ|LEXI WIRE|SENTINEL|NODE|CRITICAL)[^\]]*\][^\n]*\n?/gim, "")
    .replace(/^CRITICAL FIXES?[^\n]*\n?/gim, "")
    .replace(/^(Note|Internal Note|Canon Check|SOP-\d+)[^:\n]*:[^\n]*\n?/gim, "")
    // Strip rough block labels into natural newspaper section headings
    .replace(/^#{1,4}\s*Block\s*1\s*[:\-–—]?\s*(Answer-First\s*Summary|Overview)?/gim, "## Overview")
    .replace(/^#{1,4}\s*Block\s*2\s*[:\-–—]?\s*(Comparison\s*Table|Verified\s*Attributes|Data\s*Table)?/gim, "## Field Intelligence & Specifications")
    .replace(/^#{1,4}\s*Block\s*3\s*[:\-–—]?\s*(Deep\s*Investigative\s*Narrative|Deep\s*Dive|Investigation)?/gim, "## Investigative Dispatch")
    .replace(/^#{1,4}\s*Block\s*4\s*[:\-–—]?\s*(FAQ\s*Section|Frequently\s*Asked\s*Questions|FAQs)?/gim, "## Frequently Asked Questions")
    .replace(/^Block\s*[1-4]\s*[:\-–—]?\s*/gim, "")
    .trim();

  return cleaned;
}

export function markdownToBlocks(md: string): Block[] {
  const sanitized = cleanPolishedMarkdown(md);
  const blocks: Block[] = [];
  const lines = sanitized.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("### ")) {
      blocks.push({ type: "h2", text: line.replace(/^#+\s*/, "") });
      i++;
    } else if (line.startsWith("|") && line.indexOf("|", 1) !== -1) {
      const tableLines = [line];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const head = tableLines[0].split("|").slice(1, -1).map((c) => c.trim());
        const rows: string[][] = [];
        const isSeparator = /^\|?[\s:-|-]+\|?$/.test(tableLines[1]);
        const startRow = isSeparator ? 2 : 1;
        for (let r = startRow; r < tableLines.length; r++) {
          const cells = tableLines[r].split("|").slice(1, -1).map((c) => c.trim());
          if (cells.some((c) => c.length > 0)) {
            rows.push(cells);
          }
        }
        blocks.push({ type: "table", head, rows: rows.length > 0 ? rows : [head.map(() => "—")] });
      }
    } else if (line.startsWith(">")) {
      let quoteText = line.replace(/^>\s*/, "");
      i++;
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteText += " " + lines[i].trim().replace(/^>\s*/, "");
        i++;
      }
      blocks.push({ type: "quote", text: quoteText });
    } else if (line.startsWith("- ") || line.startsWith("* ") || /^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") ||
          lines[i].trim().startsWith("* ") ||
          /^\d+\.\s/.test(lines[i].trim()))
      ) {
        items.push(lines[i].trim().replace(/^(-\s+|\*\s+|\d+\.\s+)/, ""));
        i++;
      }
      blocks.push({ type: "list", items });
    } else {
      const pLines = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trim().startsWith("#") &&
        !lines[i].trim().startsWith("|") &&
        !lines[i].trim().startsWith(">") &&
        !lines[i].trim().startsWith("- ") &&
        !lines[i].trim().startsWith("* ") &&
        !/^\d+\.\s/.test(lines[i].trim())
      ) {
        pLines.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: "p", text: pLines.join(" ") });
    }
  }
  return blocks;
}
