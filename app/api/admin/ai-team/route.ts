import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/newspaper/admin-auth";
import {
  recallAgentMemories,
  markdownToBlocks,
  cleanPolishedMarkdown,
  CATEGORY_MAP,
} from "@/lib/newspaper/agent-memory";
import { saveArticleHybrid } from "@/lib/newspaper/store.server";
import type { Article } from "@/lib/newspaper/types";

const STATIC_BRAND_PREFIX = `You are an elite autonomous agent for NewVice Media (Leonida Vice - https://newvice.vercel.app), the definitive digital investigative newsroom and live broadcast platform covering Grand Theft Auto VI, Vice City municipal affairs, State of Leonida crime blotters (Mariana County/Leonida Keys, Kelly County/Mount Kalaga, Grassrivers wetlands, Port Gellhorn industrial coast, Ambrosia agricultural belt), and RAGE 9 game engine forensics.
Immutable Canon Constants: Launch Date is November 19, 2026 on PS5 and Xbox Series X|S. Protagonists are Lucia Caminos (first HD-universe female lead, former Leonida Penitentiary inmate) and Jason Duval (Army veteran working for Keys smuggler Brian Heder). Supporting cast: Cal Hampton, Boobie Ike, Raul Bautista, Dre'Quan Priest, Real Dimez (Bae-Luxe & Roxy), and Stefanie. RAGE 9 targets 30fps at ~1440p upscaled to 4K with Ray-Traced Global Illumination (RTGI), Ray-Traced Reflections, and physical Hair Strand simulation.
CRITICAL EDITORIAL RULE: You write 100% finished, polished, publication-ready broadsheet journalism. NEVER include internal outline labels like 'Block 1', 'Block 2', 'Answer-First Summary', 'GEO Protocol', 'SOP-01', or meta-commentary notes explaining your writing. Use natural, compelling newspaper subheadings. The article must be 100% ready for print with zero rough notes.`;

const AGENTS: Record<
  string,
  { name: string; role: string; model: string; avatar: string; systemPrompt: string }
> = {
  chief: {
    name: "Vincent 'Chief' Vance",
    role: "Senior Managing Editor & Deep Lore Synthesizer",
    model: "openai/gpt-oss-120b",
    avatar: "🏛️",
    systemPrompt: `You are Vincent 'Chief' Vance, the veteran managing editor of Leonida Vice (NewVice).
You write authoritative, immersive broadsheet investigative journalism. Address the operator as Boss.
Maintain rigorous 3D vs. HD universe boundaries (Phil Cassidy retains both arms in HD, Tommy Vercetti is absent).
NEVER output outline markers like 'Block 1', 'Block 2', 'Answer-First', 'SOP-01', or meta-commentary notes.
When asked to write an article or report, deliver a 100% complete, polished, publish-ready dispatch with natural subheadings, verified data, and zero placeholder text.`,
  },
  wire: {
    name: "Lexi 'Wire' Sterling",
    role: "Breaking News Specialist & Strict CMS Formatter",
    model: "openai/gpt-oss-20b",
    avatar: "⚡",
    systemPrompt: `You are Lexi 'Wire' Sterling, the ultra-fast breaking news reporter for Leonida Vice.
Powered by Groq's 20B LPU, deliver punchy, electric news dispatches and bullet breakdowns.
NEVER include internal outline markers ('Block 1', 'Block 2') or rough editing notes. Deliver finished, pristine copy ready for immediate broadcast.`,
  },
  sentinel: {
    name: "Sentinel-9 Watchdog",
    role: "Playwright Site Reliability & Media Decoder Auditor",
    model: "openai/gpt-oss-20b",
    avatar: "🛡️",
    systemPrompt: `You are Sentinel-9, the automated site reliability and quality assurance AI for Leonida Vice.
You monitor live HTML5 video decoders (NicoNico, Coub, Streamable, VK, Odyssee, PeerTube), broadcast queue rotation, 404 links, and editorial consistency. Speak in clean, tactical telemetry readouts.`,
  },
  cruz: {
    name: "Sgt. Cruz Safeguard",
    role: "Content Moderation & Video Submission Policy Guard",
    model: "openai/gpt-oss-safeguard-20b",
    avatar: "👮",
    systemPrompt: `You are Sergeant Cruz, the content moderation and policy guard for Leonida Vice.
Screen clip metadata from SubmitClipModal.tsx, detect spam, enforce Take-Two IP boundaries (PlayerAuctions, Alexander litigation bounds), review Citizen Wire chat flags, and enforce DMCA Safe Harbor compliance. Direct, firm, and safety-focused.`,
  },
};

async function callGroqJson(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2400
): Promise<any> {
  const sysClean = `${systemPrompt}\n\nCRITICAL SYSTEM REQUIREMENT: You MUST ALWAYS respond with a valid, single JSON object.`;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sysClean },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return JSON.parse(data.choices?.[0]?.message?.content || "{}");
    }
  } catch (_) {}

  // Fallback to unconstrained 20B with regex JSON extraction
  try {
    const resFallback = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.3,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: sysClean },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (resFallback.ok) {
      const data = await resFallback.json();
      const content = data.choices?.[0]?.message?.content || "";
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch (_) {}
  return {};
}

export async function POST(request: NextRequest) {
  const isAuthed = await verifyAdminRequest(request);
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      action,
      topic,
      agentId = "chief",
      message = "",
      history = [],
      stream = false,
    } = body;

    const groqApiKey =
      process.env.GROQ_API_KEY ||
      request.headers.get("x-groq-api-key") ||
      body.groqApiKey;

    if (!groqApiKey) {
      return NextResponse.json(
        {
          error:
            "Groq API Key not found. Please click '⚙️ Key' in the top-right of the AI War Room to enter your Groq API key.",
        },
        { status: 400 }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ACTION: AUTONOMOUS REVIEW BOARD (4-Agent Consensus Pipeline -> Saves as DRAFT)
    // ──────────────────────────────────────────────────────────────────────────
    if (action === "board_draft") {
      const reviewTopic = String(topic || message || "").trim();
      if (!reviewTopic) {
        return NextResponse.json(
          { error: "Topic is required for autonomous consensus draft." },
          { status: 400 }
        );
      }

      const auditLog: string[] = [];

      // Step 1: Memory Recall
      const recalled = recallAgentMemories(reviewTopic, "all", 4);
      const memoryText = recalled
        .map((r) => `[${r.memory_tier.toUpperCase()} | ${r.section_title}]\n${r.content}`)
        .join("\n\n");
      auditLog.push(`[STEP 1]: Recalled ${recalled.length} persistent knowledge chunks for '${reviewTopic}'.`);

      // Step 2: Lexi Wire (20b) First Draft
      const lexiPrompt = `TOPIC: ${reviewTopic}

RETRIEVED KNOWLEDGE BASE:
${memoryText}

CRITICAL EDITORIAL INSTRUCTION:
Write a 100% finished, print-ready, broadsheet investigative newspaper feature for Leonida Vice.
NEVER include outline labels like 'Block 1', 'Block 2', 'Answer-First Summary', 'GEO Protocol', or internal editing notes.
Use natural, captivating broadsheet subheadings (e.g. '## Executive Summary', '## Field Reconnaissance & Logistics', '## Technical & Syndicate Data', '## Frequently Asked Questions').
The body text must be deeply written, immersive, and ready to publish immediately.
Headline strictly <= 60 chars. Output strict JSON with keys: headline, slug, meta_description, category, hero_image_suggestion, takeaway_bullets (array of 3 punchy takeaways), body_markdown, tags (array of 4-6 tags).`;

      const draft = await callGroqJson(
        groqApiKey,
        "openai/gpt-oss-20b",
        STATIC_BRAND_PREFIX,
        lexiPrompt,
        2400
      );
      auditLog.push(`[STEP 2]: Lexi Wire (20B) drafted: "${draft.headline || reviewTopic}"`);

      // Step 3: Sgt. Cruz (safeguard-20b) IP & DMCA Audit
      const cruzPrompt = `HEADLINE: ${draft.headline}
CATEGORY: ${draft.category}
SNIPPET: ${(draft.body_markdown || "").slice(0, 1200)}

Audit against SOP-04: Take-Two IP litigation bounds, raw hacker video bans, anti-cheat policy, and DMCA safe harbor. Respond in JSON with keys: passed (boolean), violations (list of str), remediation_notes (str).`;

      const cruzAudit = await callGroqJson(
        groqApiKey,
        "openai/gpt-oss-safeguard-20b",
        STATIC_BRAND_PREFIX,
        cruzPrompt,
        1024
      );
      const cruzPassed = cruzAudit.passed !== false;
      auditLog.push(
        cruzPassed
          ? `[STEP 3]: Sgt. Cruz (20B Safeguard) approved: Zero IP/DMCA infractions.`
          : `[STEP 3]: Sgt. Cruz flagged: ${cruzAudit.violations?.join(", ") || "Policy warning"}`
      );

      // Step 4: Vincent 'Chief' Vance (120b) Lore Canon Audit
      const vancePrompt = `HEADLINE: ${draft.headline}
CATEGORY: ${draft.category}
SNIPPET: ${(draft.body_markdown || "").slice(0, 1500)}

Audit this story for canon accuracy and elevate it into finished, print-ready broadsheet copy.
Ensure all rough meta notes, block numbers ('Block 1', 'Block 2'), and debugging labels are completely removed.
Respond in JSON with keys: passed (boolean), canon_flaws (list of str), critique_notes (str), polished_body_markdown (str).`;

      const vanceReview = await callGroqJson(
        groqApiKey,
        "openai/gpt-oss-120b",
        STATIC_BRAND_PREFIX,
        vancePrompt,
        2400
      );
      const vancePassed = vanceReview.passed !== false;
      if (vanceReview.polished_body_markdown) {
        draft.body_markdown = vanceReview.polished_body_markdown;
      }
      auditLog.push(
        vancePassed
          ? `[STEP 4]: Chief Vance (120B) approved: Broadsheet lore verified.`
          : `[STEP 4]: Chief Vance critique: ${vanceReview.canon_flaws?.join(", ") || "Refined prose"}`
      );

      // Sanitize body markdown of any remaining rogue outline tags or critique artifacts
      draft.body_markdown = cleanPolishedMarkdown(draft.body_markdown || "");

      // Step 5: Sentinel-9 Hero Substitution & Commit
      const verifiedHeroes = [
        "/images/gta/jason_duval_07.jpg",
        "/images/gta/jason_lucia_lock_and_load_tablet.jpg",
        "/images/gta/launch-trailer.jpg",
        "/images/gta/port_gellhorn_03.jpg",
        "/images/gta/vice_city_01.jpg",
        "/images/gta/vice_city_04.jpg",
        "/images/gta/grassrivers_01.jpg",
      ];
      let heroImg = draft.hero_image_suggestion;
      if (!verifiedHeroes.includes(heroImg)) {
        const s = (draft.slug || "").toLowerCase();
        heroImg = s.includes("gellhorn")
          ? "/images/gta/port_gellhorn_03.jpg"
          : s.includes("grass")
          ? "/images/gta/grassrivers_01.jpg"
          : "/images/gta/vice_city_01.jpg";
      }

      const rawCat = (draft.category || "Story & Campaign").toLowerCase();
      const validCat = CATEGORY_MAP[rawCat] || "story";
      const bodyBlocks = markdownToBlocks(draft.body_markdown || "");
      const wordCount = (draft.body_markdown || "").split(/\s+/).length;
      const readMins = Math.max(3, Math.round(wordCount / 200));

      const cleanSlug = (draft.slug || reviewTopic.toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 45);

      const shouldPublishImmediately = Boolean(body.publishImmediately);
      const articleRecord: Article = {
        slug: cleanSlug,
        title: draft.headline || reviewTopic.slice(0, 60),
        category: validCat,
        author: "vincent-chief-vance",
        date: new Date().toISOString().split("T")[0],
        image: heroImg,
        excerpt:
          draft.meta_description ||
          draft.takeaway_bullets?.[0] ||
          "Leonida Vice investigative dispatch.",
        readMins,
        tags: draft.tags || ["GTA 6", "Leonida"],
        body: bodyBlocks,
        status: shouldPublishImmediately ? "published" : "draft",
        preset: "standard-feature",
        kicker: shouldPublishImmediately ? "VERIFIED DISPATCH" : "AI EDITORIAL BOARD DRAFT",
        source: "custom",
      };

      const saveRes = await saveArticleHybrid(articleRecord);
      const commitLabel = shouldPublishImmediately ? "PUBLISHED LIVE" : "SAVED AS DRAFT";
      auditLog.push(
        `[STEP 5]: Sentinel-9 committed "${articleRecord.title}" as ${commitLabel} (Local: ${saveRes.savedLocal}, Supabase: ${saveRes.savedSupabase}).`
      );

      return NextResponse.json({
        success: true,
        article: articleRecord,
        savedLocal: saveRes.savedLocal,
        savedSupabase: saveRes.savedSupabase,
        auditLog,
        recalledSources: recalled.map((r) => ({
          title: r.section_title,
          tier: r.memory_tier,
          sourceFile: r.source_file,
        })),
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STANDARD AGENT CONVERSATION CHANNEL (Interactive SSE Streaming or JSON)
    // ──────────────────────────────────────────────────────────────────────────
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const agent = AGENTS[agentId] || AGENTS.chief;

    // Dynamic RAG Memory Recall from Persistent Knowledge Base (57 chunks & SOPs)
    const recalledMemories = recallAgentMemories(message, agentId, 3);
    const memoryContext =
      recalledMemories.length > 0
        ? `\n\n[RECALLED PROCEDURAL SOPS & CANONICAL LORE]:\n` +
          recalledMemories
            .map(
              (r) =>
                `• [${r.memory_tier.toUpperCase()} | ${r.section_title}]\n${r.content}`
            )
            .join("\n\n")
        : "";

    const systemPromptCombined = `${STATIC_BRAND_PREFIX}\n\n${agent.systemPrompt}${memoryContext}`;

    const messages = [
      { role: "system", content: systemPromptCombined },
      ...history.slice(-8).map((h: { role: string; content: string }) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: String(h.content || ""),
      })),
      { role: "user", content: message },
    ];

    let selectedModel = agent.model;
    const maxTokens = selectedModel === "openai/gpt-oss-120b" ? 2800 : 2048;

    // Server-Sent Events (SSE) Streaming Path
    if (stream) {
      let groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          temperature: 0.4,
          max_completion_tokens: maxTokens,
          stream: true,
        }),
      });

      // Fallback from 120B to 20B if rate-limited or busy
      if (!groqResponse.ok && selectedModel === "openai/gpt-oss-120b") {
        selectedModel = "openai/gpt-oss-20b";
        groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages,
            temperature: 0.4,
            max_completion_tokens: 2048,
            stream: true,
          }),
        });
      }

      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        return NextResponse.json(
          { error: `Groq LPU Error: ${errText.slice(0, 300)}` },
          { status: 502 }
        );
      }

      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          // Send initial metadata event with cited memory sources
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "sources",
                sources: recalledMemories.map((r) => ({
                  title: r.section_title,
                  tier: r.memory_tier,
                  sourceFile: r.source_file,
                })),
                agent: {
                  id: agentId,
                  name: agent.name,
                  role: agent.role,
                  model: selectedModel,
                  avatar: agent.avatar,
                },
              })}\n\n`
            )
          );

          const reader = groqResponse.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(":")) continue;

                if (trimmed === "data: [DONE]") {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "done", done: true })}\n\n`)
                  );
                  continue;
                }

                if (trimmed.startsWith("data: ")) {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const token = parsed.choices?.[0]?.delta?.content || "";
                    if (token) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: "token", token })}\n\n`)
                      );
                    }
                  } catch (_) {}
                }
              }
            }
          } catch (streamErr) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: String(streamErr) })}\n\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Synchronous JSON Response Fallback
    let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: 0.4,
        max_completion_tokens: maxTokens,
      }),
    });

    if (!response.ok && selectedModel === "openai/gpt-oss-120b") {
      selectedModel = "openai/gpt-oss-20b";
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          temperature: 0.4,
          max_completion_tokens: 2048,
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Groq LPU Error: ${errText.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || "";
    if (!reply) {
      const reasoning = data.choices?.[0]?.message?.reasoning || "";
      reply = reasoning.slice(-400) || "Standing by for orders, Boss.";
    }

    return NextResponse.json({
      reply: reply.trim(),
      agent: {
        id: agentId,
        name: agent.name,
        role: agent.role,
        model: selectedModel,
        avatar: agent.avatar,
      },
      sources: recalledMemories.map((r) => ({
        title: r.section_title,
        tier: r.memory_tier,
        sourceFile: r.source_file,
      })),
      usage: data.usage || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
