import path from "path";
import fs from "fs";
import type { Block, CategorySlug } from "./types";
export { cleanPolishedMarkdown, markdownToBlocks, CATEGORY_MAP } from "./clean-markdown";

export interface KnowledgeMemoryChunk {
  content_hash: string;
  memory_tier: "working_active" | "procedural_sop" | "episodic_event" | "semantic_lore" | "policy_constraint";
  source_file: string;
  domain_pillar: string;
  section_title: string;
  content: string;
  agent_scope: string | string[];
  entity_tags: string[];
  importance_weight: number;
  embedding?: number[];
}

export interface RecalledMemoryItem {
  section_title: string;
  memory_tier: string;
  content: string;
  source_file: string;
  importance_weight: number;
  score: number;
}

let cachedMemoryStore: KnowledgeMemoryChunk[] | null = null;

export function getAgentMemoryStore(): KnowledgeMemoryChunk[] {
  if (cachedMemoryStore) return cachedMemoryStore;

  try {
    const memoryFilePath = path.join(process.cwd(), "data", "agent_knowledge_memory.json");
    if (fs.existsSync(memoryFilePath)) {
      const raw = fs.readFileSync(memoryFilePath, "utf-8");
      cachedMemoryStore = JSON.parse(raw);
      return cachedMemoryStore || [];
    }
  } catch (err) {
    console.error("[AgentMemory] Failed to load agent_knowledge_memory.json:", err);
  }
  return [];
}

const COMMON_ENTITIES = [
  "lucia", "jason", "duval", "caminos", "cal hampton", "boobie ike", "raul bautista",
  "drequan priest", "brian heder", "stefanie", "phil cassidy", "vice city", "leonida",
  "mariana", "keys", "kelly county", "mount kalaga", "grassrivers", "port gellhorn",
  "ambrosia", "rage 9", "rtgi", "60fps", "30fps", "upscaling", "dmca", "take-two",
  "playwright", "niconico", "coub", "streamable", "vk", "peertube", "sop-01", "sop-02",
  "sop-03", "sop-04", "vance", "wire", "cruz", "sentinel"
];

export function recallAgentMemories(
  query: string,
  agentId: string,
  limit: number = 3
): RecalledMemoryItem[] {
  const store = getAgentMemoryStore();
  if (!store || store.length === 0) return [];

  const lowerQuery = query.toLowerCase();
  const queryTokens = lowerQuery
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const queryEntities = COMMON_ENTITIES.filter((entity) => lowerQuery.includes(entity));

  const scored: RecalledMemoryItem[] = [];

  for (const chunk of store) {
    let score = 0;

    // Agent Scope Affinity: boost matching agent or SOP
    const rawScope = chunk.agent_scope;
    const scopeList: string[] = Array.isArray(rawScope)
      ? rawScope.map((s) => String(s).toLowerCase())
      : typeof rawScope === "string"
      ? [rawScope.toLowerCase()]
      : ["all"];

    const targetAgent = (agentId || "").toLowerCase();
    const isScopeMatch =
      scopeList.includes("all") ||
      scopeList.some(
        (s) =>
          s.includes(targetAgent) ||
          targetAgent.includes(s) ||
          (targetAgent === "chief" && s.includes("vance")) ||
          (targetAgent === "wire" && s.includes("lexi")) ||
          (targetAgent === "cruz" && s.includes("safeguard")) ||
          (targetAgent === "sentinel" && s.includes("watchdog"))
      );

    if (isScopeMatch) {
      score += 2.0;
    }

    // Entity matching
    if (chunk.entity_tags && Array.isArray(chunk.entity_tags)) {
      for (const ent of chunk.entity_tags) {
        const entClean = ent.toLowerCase().replace(/_/g, " ");
        if (queryEntities.some((qe) => entClean.includes(qe) || qe.includes(entClean))) {
          score += 4.5;
        }
      }
    }

    // Lexical match in Section Title
    const titleLower = chunk.section_title.toLowerCase();
    for (const token of queryTokens) {
      if (titleLower.includes(token)) {
        score += 3.0;
      }
    }

    // Lexical match in Content body
    const contentLower = chunk.content.toLowerCase();
    for (const token of queryTokens) {
      if (contentLower.includes(token)) {
        score += 1.0;
      }
    }

    // SOP priority boost
    if (chunk.memory_tier === "procedural_sop" && isScopeMatch) {
      score += 3.5;
    }

    // Multiply by baseline importance weight
    const finalScore = score * (chunk.importance_weight || 1.0);

    if (finalScore > 1.5) {
      scored.push({
        section_title: chunk.section_title,
        memory_tier: chunk.memory_tier,
        content: chunk.content.length > 700 ? chunk.content.slice(0, 690) + "..." : chunk.content,
        source_file: chunk.source_file,
        importance_weight: chunk.importance_weight,
        score: finalScore,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
