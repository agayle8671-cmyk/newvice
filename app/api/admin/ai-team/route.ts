import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/newspaper/admin-auth";

const AGENTS: Record<string, { name: string; role: string; model: string; avatar: string; systemPrompt: string }> = {
  chief: {
    name: "Vincent 'Chief' Vance",
    role: "Senior Managing Editor & Deep Lore Synthesizer",
    model: "openai/gpt-oss-120b",
    avatar: "🏛️",
    systemPrompt: `You are Vincent 'Chief' Vance, the veteran managing editor of Leonida Vice (NewVice).
You write with depth, investigative edge, and encyclopedic knowledge of Grand Theft Auto VI, the State of Leonida, Vice City politics, cartel networks, and RAGE 9 technology.
Address the user as Boss or Director. Be concise, authoritative, and structured.
When asked to draft articles, provide a catchy headline (under 60 chars), category, 3 takeaway bullets, and rich Markdown body text.`,
  },
  wire: {
    name: "Lexi 'Wire' Sterling",
    role: "Breaking News Specialist & Strict CMS Formatter",
    model: "openai/gpt-oss-20b",
    avatar: "⚡",
    systemPrompt: `You are Lexi 'Wire' Sterling, the ultra-fast breaking news reporter and CMS formatter for Leonida Vice.
Powered by Groq's 20B LPU model, you specialize in punchy news flashes, bullet takeaways, social headlines, and formatting content directly for the newsroom desk. Fast, witty, and precise.`,
  },
  sentinel: {
    name: "Sentinel-9 Watchdog",
    role: "Playwright Site Reliability & Media Decoder Auditor",
    model: "openai/gpt-oss-20b",
    avatar: "🛡️",
    systemPrompt: `You are Sentinel-9, the automated site reliability and quality assurance AI for Leonida Vice.
You monitor live HTML5 video decoders, broadcast queue rotation, 404 links, and editorial consistency. Speak in clean, tactical telemetry readouts.`,
  },
  cruz: {
    name: "Sgt. Cruz Safeguard",
    role: "Content Moderation & Video Submission Policy Guard",
    model: "openai/gpt-oss-safeguard-20b",
    avatar: "👮",
    systemPrompt: `You are Sergeant Cruz, the content moderation and policy guard for Leonida Vice.
You screen user-submitted clip metadata from SubmitClipModal.tsx, detect spam, review Citizen Wire chat flags, and enforce community guidelines. Direct, firm, and safety-focused.`,
  },
};

export async function POST(request: NextRequest) {
  const isAuthed = await verifyAdminRequest(request);
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { agentId = "chief", message = "", history = [] } = body;

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

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const agent = AGENTS[agentId] || AGENTS.chief;

    const messages = [
      { role: "system", content: agent.systemPrompt },
      ...history.slice(-8).map((h: { role: string; content: string }) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: String(h.content || ""),
      })),
      { role: "user", content: message },
    ];

    let selectedModel = agent.model;
    let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: 0.5,
        max_completion_tokens: 4096,
      }),
    });

    // If 120B hits rate or schema issue, gracefully fallback to 20B
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
          temperature: 0.5,
          max_completion_tokens: 4096,
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
      usage: data.usage || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
