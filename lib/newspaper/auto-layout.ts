import type {
  Article,
  ArticlePreset,
  Block,
  CategorySlug,
} from "./types";

export interface InlineImageDraft {
  id: string;
  src: string;
  caption: string;
}

export interface PresetConfig {
  id: ArticlePreset;
  label: string;
  badge: string;
  defaultCategory: CategorySlug;
  defaultKicker: string;
  description: string;
  bodyPlaceholder: string;
  autoSubheads: string[];
}

export const PRESET_CONFIGS: Record<ArticlePreset, PresetConfig> = {
  "standard-feature": {
    id: "standard-feature",
    label: "Standard Feature",
    badge: "INVESTIGATIVE",
    defaultCategory: "story",
    defaultKicker: "",
    description:
      "Full magazine feature with bold H2 subheads, evenly spaced scroll photography, pull-quote, and optional data table.",
    bodyPlaceholder: `Paste your full article text here — separate paragraphs with a blank line.

## Optional Section Heading
You can prefix headings with ## (or just write a short standalone title line), start bullet lines with - , or wrap pull-quotes with > . Even if you just paste plain paragraphs, the auto-formatter spaces your sections and weaves your inline images evenly down the scroll.`,
    autoSubheads: [
      "Inside the Leonida Dispatch",
      "Key Evidence & Frame Analysis",
      "What This Means Moving Forward",
    ],
  },
  "police-blotter": {
    id: "police-blotter",
    label: "Live Police Blotter",
    badge: "BLOTTER",
    defaultCategory: "leonida",
    defaultKicker: "LEONIDA POLICE BLOTTER",
    description:
      "Punchy in-universe incident report & community clip spotlight with an automatic VCPD Dossier table, evidence stills, and desk verdict.",
    bodyPlaceholder: `Describe what went down in Leonida — where the suspect started, how the pursuit escalated, and what bystanders caught on camera.

## Witnesses & Scanner Traffic
Add colorful local color, scanner chatter, or how the physics/AI reacted during the chaos.`,
    autoSubheads: [
      "Incident Reconstruction",
      "Scanner Traffic & Eyewitness Accounts",
    ],
  },
  "utility-guide": {
    id: "utility-guide",
    label: "Utility / Location Guide",
    badge: "FIELD GUIDE",
    defaultCategory: "vehicles-weapons",
    defaultKicker: "VERIFIED FIELD GUIDE",
    description:
      "Launch-ready player utility guide with a top Quick-Reference Spec Box, step-by-step checklist, map/location photos, and Pro-Tip callout.",
    bodyPlaceholder: `Explain why this location, vehicle, weapon, or money method matters and what players should bring before heading out.

## Exact Route & Execution Notes
Break down landmarks, timing windows, guards/hazards, and how to secure the payout cleanly.`,
    autoSubheads: [
      "Where to Find It on the Map",
      "Execution Strategy & Payout Breakdown",
    ],
  },
  "breaking-brief": {
    id: "breaking-brief",
    label: "Breaking Brief",
    badge: "BREAKING WIRE",
    defaultCategory: "trailers-media",
    defaultKicker: "BREAKING NEWS WIRE",
    description:
      "90-second rapid dispatch for sudden Rockstar drops, patches, or discoveries — lead summary, key bullet developments, and visual proof.",
    bodyPlaceholder: `Lead with the confirmed announcement, discovery, or patch change right at the top.

## Why It Matters for Leonida Players
Add immediate context on how this impacts launch week or gameplay.`,
    autoSubheads: ["Immediate Impact & Context"],
  },
};

export interface AutoLayoutInput {
  preset: ArticlePreset;
  title: string;
  rawText: string;
  inlineImages: InlineImageDraft[];
  autoGenerateSubheads?: boolean;
  // Shared optional enrichments
  pullQuote?: string;
  pullQuoteCite?: string;
  specTableText?: string; // Pipe-separated lines: Header1 | Header2 \n Cell1 | Cell2
  // Police Blotter fields
  blotterDistrict?: string;
  blotterWantedStars?: number;
  blotterSuspect?: string;
  blotterIncident?: string;
  blotterClipSource?: string;
  // Utility Guide fields
  guideLocation?: string;
  guideReward?: string;
  guideRequirement?: string;
  guideStepsText?: string;
  // Breaking Brief fields
  briefBulletsText?: string;
}

export function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96);
}

/** Parse pipe-separated text into a clean Table block */
export function parsePipeTable(raw?: string): Extract<Block, { type: "table" }> | null {
  if (!raw || !raw.trim()) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes("|") && !/^[-|:\s]+$/.test(l));
  if (lines.length < 2) return null;

  const splitRow = (line: string) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  const head = splitRow(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const cells = splitRow(l);
    while (cells.length < head.length) cells.push("—");
    return cells.slice(0, head.length);
  });

  return head.length > 0 && rows.length > 0 ? { type: "table", head, rows } : null;
}

/** Parse raw pasted copy into structured blocks (h2, p, list, quote, table) */
export function parseRawCopyToBlocks(
  rawText: string,
  preset: ArticlePreset,
  autoGenerateSubheads = true
): Block[] {
  const normalized = (rawText || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks = normalized
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);

  const blocks: Block[] = [];

  for (const chunk of chunks) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    // 1. Explicit Markdown heading (## Heading)
    if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
      blocks.push({
        type: "h2",
        text: lines[0].replace(/^#{1,3}\s+/, "").trim(),
      });
      continue;
    }

    // 2. Heading followed immediately by paragraph on next line without blank line
    if (lines.length > 1 && /^#{1,3}\s+/.test(lines[0])) {
      blocks.push({
        type: "h2",
        text: lines[0].replace(/^#{1,3}\s+/, "").trim(),
      });
      blocks.push({
        type: "p",
        text: lines.slice(1).join(" "),
      });
      continue;
    }

    // 3. Pipe table chunk
    if (lines.length >= 2 && lines.every((l) => l.includes("|"))) {
      const tbl = parsePipeTable(chunk);
      if (tbl) {
        blocks.push(tbl);
        continue;
      }
    }

    // 4. Bullet / numbered list chunk
    if (
      lines.length >= 1 &&
      lines.every((l) => /^([-*•]|\d+[.)])\s+/.test(l))
    ) {
      blocks.push({
        type: "list",
        items: lines.map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, "").trim()),
      });
      continue;
    }

    // 5. Blockquote chunk (> Quote — Cite)
    if (lines.every((l) => l.startsWith(">"))) {
      const cleaned = lines.map((l) => l.replace(/^>\s*/, "")).join(" ");
      const dashMatch = cleaned.match(/^(.*?)\s+[—–-]{1,2}\s+([A-Z][\w\s.,'&/-]{2,60})$/);
      if (dashMatch) {
        blocks.push({
          type: "quote",
          text: dashMatch[1].replace(/^[“"']|[”"']$/g, "").trim(),
          cite: dashMatch[2].trim(),
        });
      } else {
        blocks.push({
          type: "quote",
          text: cleaned.replace(/^[“"']|[”"']$/g, "").trim(),
        });
      }
      continue;
    }

    // 6. Natural standalone short subhead detection (single short line, no ending period, after opening paragraph)
    if (
      blocks.length >= 1 &&
      lines.length === 1 &&
      lines[0].length >= 8 &&
      lines[0].length <= 72 &&
      !/[.!?;:]$/.test(lines[0]) &&
      /^[A-Z0-9"“']/.test(lines[0])
    ) {
      blocks.push({ type: "h2", text: lines[0] });
      continue;
    }

    // 7. Standard paragraph (if multi-line prose, join cleanly)
    blocks.push({
      type: "p",
      text: lines.join(" "),
    });
  }

  // If the writer pasted 4+ plain paragraphs without a single H2, automatically inject
  // preset-appropriate broadsheet subheads every ~2 paragraphs so typography stays uniform!
  const hasAnyH2 = blocks.some((b) => b.type === "h2");
  const paragraphCount = blocks.filter((b) => b.type === "p").length;
  if (!hasAnyH2 && autoGenerateSubheads && paragraphCount >= 3) {
    const subheads = PRESET_CONFIGS[preset].autoSubheads;
    const withHeads: Block[] = [];
    let pSeen = 0;
    let headIdx = 0;
    for (let i = 0; i < blocks.length; i++) {
      const blk = blocks[i];
      if (
        blk.type === "p" &&
        pSeen >= 1 &&
        pSeen % 2 === 1 &&
        headIdx < subheads.length &&
        i < blocks.length - 1
      ) {
        withHeads.push({ type: "h2", text: subheads[headIdx++] });
      }
      withHeads.push(blk);
      if (blk.type === "p") pSeen++;
    }
    return withHeads;
  }

  return blocks;
}

/**
 * Evenly distributes inline images + captions down the article scroll:
 * - Never at position 0 (Hero image already sits right above block 0)
 * - Never immediately after an H2 heading (headings stay attached to their opening paragraph)
 * - Never clumped together when multiple paragraphs exist
 */
export function weaveInlineImages(
  contentBlocks: Block[],
  inlineImages: InlineImageDraft[]
): Block[] {
  const validImages = inlineImages.filter((img) => img.src && img.src.trim().length > 0);
  if (validImages.length === 0) return contentBlocks;

  if (contentBlocks.length === 0) {
    return validImages.map((img) => ({
      type: "img",
      src: img.src.trim(),
      caption: img.caption.trim() || undefined,
    }));
  }

  // Candidate insertion slots (1..contentBlocks.length) where preceding block is NOT an h2
  const validSlots: number[] = [];
  for (let idx = 1; idx <= contentBlocks.length; idx++) {
    if (contentBlocks[idx - 1]?.type !== "h2") {
      validSlots.push(idx);
    }
  }

  if (validSlots.length === 0) {
    return [
      ...contentBlocks,
      ...validImages.map((img) => ({
        type: "img" as const,
        src: img.src.trim(),
        caption: img.caption.trim() || undefined,
      })),
    ];
  }

  // Prefer interior scroll slots over trailing end when enough slots exist
  const interiorSlots =
    validSlots.length > validImages.length &&
    validSlots[validSlots.length - 1] === contentBlocks.length
      ? validSlots.slice(0, -1)
      : validSlots;

  const pool = interiorSlots.length >= validImages.length ? interiorSlots : validSlots;

  const insertionsByBlockIndex = new Map<number, Block[]>();
  let lastPickedPoolIdx = -1;

  for (let k = 0; k < validImages.length; k++) {
    const ideal = Math.round(((k + 1) * (pool.length + 1)) / (validImages.length + 1)) - 1;
    let poolIdx = Math.max(0, Math.min(pool.length - 1, ideal));
    if (poolIdx <= lastPickedPoolIdx && lastPickedPoolIdx + 1 < pool.length) {
      poolIdx = lastPickedPoolIdx + 1;
    }
    lastPickedPoolIdx = poolIdx;

    const targetBlockIdx = pool[poolIdx];
    const list = insertionsByBlockIndex.get(targetBlockIdx) ?? [];
    list.push({
      type: "img",
      src: validImages[k].src.trim(),
      caption: validImages[k].caption.trim() || undefined,
    });
    insertionsByBlockIndex.set(targetBlockIdx, list);
  }

  const result: Block[] = [];
  for (let i = 0; i <= contentBlocks.length; i++) {
    const imgsHere = insertionsByBlockIndex.get(i);
    if (imgsHere) {
      result.push(...imgsHere);
    }
    if (i < contentBlocks.length) {
      result.push(contentBlocks[i]);
    }
  }
  return result;
}

/** Build the complete uniform broadsheet Block[] array from form inputs */
export function buildUniformArticleBlocks(input: AutoLayoutInput): Block[] {
  const baseBlocks = parseRawCopyToBlocks(
    input.rawText,
    input.preset,
    input.autoGenerateSubheads ?? true
  );

  const structuredBlocks: Block[] = [];

  // Keep opening lead paragraph at index 0 whenever available
  let cursor = 0;
  if (baseBlocks[0]?.type === "p") {
    structuredBlocks.push(baseBlocks[0]);
    cursor = 1;
  }

  // 1. Preset-specific uniform top modules
  if (input.preset === "police-blotter") {
    const starsNum = Math.min(6, Math.max(1, Number(input.blotterWantedStars) || 4));
    const starsVisual =
      "★".repeat(starsNum) + "☆".repeat(Math.max(0, 6 - starsNum)) + ` (${starsNum}-Star Response)`;
    const rows: string[][] = [
      ["District / Sector", input.blotterDistrict?.trim() || "Vice Beach Metro Sector"],
      ["Wanted Level", starsVisual],
      ["Primary Suspect / Tipster", input.blotterSuspect?.trim() || "Unidentified Leonida Motorist"],
      ["Incident Classification", input.blotterIncident?.trim() || "Felony Evasion & Property Damage"],
    ];
    if (input.blotterClipSource?.trim()) {
      rows.push(["Broadcast Evidence", input.blotterClipSource.trim()]);
    }
    structuredBlocks.push({
      type: "h2",
      text: "Leonida PD Incident Dossier",
    });
    structuredBlocks.push({
      type: "table",
      head: ["Blotter Field", "Verified Dispatch Record"],
      rows,
    });
  } else if (input.preset === "utility-guide") {
    const hasGuideMeta =
      input.guideLocation?.trim() ||
      input.guideReward?.trim() ||
      input.guideRequirement?.trim();
    if (hasGuideMeta) {
      structuredBlocks.push({
        type: "h2",
        text: "Quick-Reference Field Specs",
      });
      structuredBlocks.push({
        type: "table",
        head: ["Parameter", "Verified Detail"],
        rows: [
          ["Map Location / Sector", input.guideLocation?.trim() || "State of Leonida"],
          ["Reward / Value / Target", input.guideReward?.trim() || "High-Priority Unlock"],
          ["Requirements & Timing", input.guideRequirement?.trim() || "Open World Free Roam"],
        ],
      });
    }
    const stepLines = (input.guideStepsText || "")
      .split(/\r?\n/)
      .map((s) => s.replace(/^([-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
    if (stepLines.length > 0) {
      structuredBlocks.push({
        type: "h2",
        text: "Step-by-Step Execution Checklist",
      });
      structuredBlocks.push({
        type: "list",
        items: stepLines,
      });
    }
  } else if (input.preset === "breaking-brief") {
    const bulletLines = (input.briefBulletsText || "")
      .split(/\r?\n/)
      .map((s) => s.replace(/^([-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
    if (bulletLines.length > 0) {
      structuredBlocks.push({
        type: "h2",
        text: "Key Developments at a Glance",
      });
      structuredBlocks.push({
        type: "list",
        items: bulletLines,
      });
    }
  }

  // Append remaining narrative blocks
  structuredBlocks.push(...baseBlocks.slice(cursor));

  // Optional custom pipe-table (e.g. for Standard Feature)
  const extraTable = parsePipeTable(input.specTableText);
  if (extraTable) {
    // Insert before the final paragraph if possible, otherwise append
    const insertAt =
      structuredBlocks.length >= 2 ? structuredBlocks.length - 1 : structuredBlocks.length;
    structuredBlocks.splice(insertAt, 0, extraTable);
  }

  // Optional editorial pull-quote / Pro-Tip / Blotter Verdict
  if (input.pullQuote && input.pullQuote.trim()) {
    const defaultCite =
      input.preset === "police-blotter"
        ? "Leonida Vice Crime Desk"
        : input.preset === "utility-guide"
        ? "Leonida Vice Field Guide Pro-Tip"
        : "Leonida Vice Editorial Desk";
    const quoteBlock: Block = {
      type: "quote",
      text: input.pullQuote.replace(/^[“"']|[”"']$/g, "").trim(),
      cite: input.pullQuoteCite?.trim() || defaultCite,
    };
    const quotePos =
      structuredBlocks.length >= 3
        ? Math.max(2, structuredBlocks.length - 1)
        : structuredBlocks.length;
    structuredBlocks.splice(quotePos, 0, quoteBlock);
  }

  // Weave inline images + captions evenly down the scroll!
  return weaveInlineImages(structuredBlocks, input.inlineImages);
}

/** Compute reading time in minutes (~210 words per minute, minimum 2 min) */
export function computeReadMins(blocks: Block[], excerpt = ""): number {
  let words = excerpt.trim().split(/\s+/).filter(Boolean).length;
  for (const b of blocks) {
    if (b.type === "p" || b.type === "h2" || b.type === "quote") {
      words += b.text.split(/\s+/).filter(Boolean).length;
    } else if (b.type === "list") {
      words += b.items.join(" ").split(/\s+/).filter(Boolean).length;
    } else if (b.type === "table") {
      words +=
        b.head.join(" ").split(/\s+/).length +
        b.rows.flat().join(" ").split(/\s+/).length;
    }
  }
  return Math.max(2, Math.round(words / 210));
}

/** Auto-derive a punchy 1-2 sentence broadsheet lead excerpt if left blank */
export function deriveExcerpt(blocks: Block[], fallbackTitle: string): string {
  const firstP = blocks.find((b): b is Extract<Block, { type: "p" }> => b.type === "p");
  if (!firstP) {
    return `Full Leonida Vice dispatch covering ${fallbackTitle}.`;
  }
  const clean = firstP.text.trim();
  if (clean.length <= 210) return clean;
  const clipped = clean.slice(0, 205);
  const lastSentence = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "));
  if (lastSentence > 85) {
    return clipped.slice(0, lastSentence + 1);
  }
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 60 ? lastSpace : 200)}…`;
}

/** Extract editable text + inline images back out of an existing Article when opening it in Edit mode */
export function decomposeArticleForEditor(article: Article): {
  rawText: string;
  inlineImages: InlineImageDraft[];
} {
  const inlineImages: InlineImageDraft[] = [];
  const textChunks: string[] = [];

  article.body.forEach((b, idx) => {
    if (b.type === "img") {
      inlineImages.push({
        id: `img_${idx}_${Date.now()}`,
        src: b.src,
        caption: b.caption ?? "",
      });
    } else if (b.type === "h2") {
      textChunks.push(`## ${b.text}`);
    } else if (b.type === "p") {
      textChunks.push(b.text);
    } else if (b.type === "list") {
      textChunks.push(b.items.map((it) => `- ${it}`).join("\n"));
    } else if (b.type === "quote") {
      textChunks.push(b.cite ? `> "${b.text}" — ${b.cite}` : `> "${b.text}"`);
    } else if (b.type === "table") {
      const lines = [
        b.head.join(" | "),
        ...b.rows.map((r) => r.join(" | ")),
      ];
      textChunks.push(lines.join("\n"));
    }
  });

  return {
    rawText: textChunks.join("\n\n"),
    inlineImages,
  };
}
