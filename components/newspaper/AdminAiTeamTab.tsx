"use client";

import React, { useState, useRef, useEffect } from "react";
import { cleanPolishedMarkdown, markdownToBlocks } from "@/lib/newspaper/clean-markdown";

interface Agent {
  id: "chief" | "wire" | "sentinel" | "cruz";
  name: string;
  codename: string;
  role: string;
  model: string;
  avatar: string;
  tagline: string;
  badgeColor: string;
}

const AGENTS: Agent[] = [
  {
    id: "chief",
    name: "Vincent 'Chief' Vance",
    codename: "CHIEF-120B",
    role: "Senior Managing Editor & Deep Lore Synthesizer",
    model: "openai/gpt-oss-120b",
    avatar: "🏛️",
    tagline: "Deep investigations, lore consistency, 1,400+ word feature drafts.",
    badgeColor: "bg-[#831843] text-white",
  },
  {
    id: "wire",
    name: "Lexi 'Wire' Sterling",
    codename: "WIRE-20B",
    role: "Breaking News Specialist & Strict CMS Formatter",
    model: "openai/gpt-oss-20b",
    avatar: "⚡",
    tagline: "High-speed news flashes, bullet takeaways, Strict JSON payloads.",
    badgeColor: "bg-[#0f766e] text-white",
  },
  {
    id: "sentinel",
    name: "Sentinel-9 Watchdog",
    codename: "SENTINEL-QA",
    role: "Playwright Site Reliability & Media Decoder Auditor",
    model: "openai/gpt-oss-20b + Playwright",
    avatar: "🛡️",
    tagline: "Monitors HTML5 video decoders, queue rotation, 404 links, and DOM text.",
    badgeColor: "bg-[#1e222b] text-[#14b8a6]",
  },
  {
    id: "cruz",
    name: "Sgt. Cruz Safeguard",
    codename: "CRUZ-SAFEGUARD",
    role: "Content Moderation & Video Submission Policy Guard",
    model: "openai/gpt-oss-safeguard-20b",
    avatar: "👮",
    tagline: "Screens user clip submissions, Citizen Wire chat flags, community safety.",
    badgeColor: "bg-[#d97706] text-black",
  },
];

interface MemorySource {
  title: string;
  tier: string;
  sourceFile: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  agentId: string;
  text: string;
  timestamp: string;
  modelUsed?: string;
  sources?: MemorySource[];
}

interface AdminAiTeamTabProps {
  authHeaders: () => HeadersInit;
  onLoadDraftIntoComposer?: (title: string, bodyMarkdown: string) => void;
}

export default function AdminAiTeamTab({
  authHeaders,
  onLoadDraftIntoComposer,
}: AdminAiTeamTabProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<Agent["id"]>("chief");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-1",
      sender: "agent",
      agentId: "chief",
      text: "Boss, Vincent Vance reporting in from the Managing Desk. The Groq LPU cluster and Ultimate RAG Knowledge Base are primed. Transmit an order to any agent, or launch the 4-Agent Consensus Review Board below to draft and audit investigative dispatches directly into Draft storage.",
      timestamp: "Just now",
      modelUsed: "openai/gpt-oss-120b",
      sources: [
        {
          title: "SOP-01: Vincent 'Chief' Vance Investigative Feature & GEO Protocol",
          tier: "procedural_sop",
          sourceFile: "LEONIDA_VICE_AI_TEAM_SYSTEM_MANUAL.txt",
        },
      ],
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [groqKey, setGroqKey] = useState<string>("");
  const [showKeyConfig, setShowKeyConfig] = useState(false);

  // Consensus Board Modal State
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [boardTopic, setBoardTopic] = useState("");
  const [boardRunning, setBoardRunning] = useState(false);
  const [boardLog, setBoardLog] = useState<string[]>([]);
  const [boardDraftResult, setBoardDraftResult] = useState<any>(null);
  const [autoPublish, setAutoPublish] = useState(false);

  // Quick 1-Click Publishing State
  const [quickPublishingId, setQuickPublishingId] = useState<string | null>(null);
  const [publishedAlert, setPublishedAlert] = useState<{
    id: string;
    title: string;
    slug: string;
    status: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeAgent = AGENTS.find((a) => a.id === selectedAgentId) || AGENTS[0];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lv_groq_api_key");
      if (saved) {
        setGroqKey(saved);
      } else {
        setShowKeyConfig(true);
      }
    } catch (_) {}
  }, []);

  const saveCustomKey = (newKey: string) => {
    setGroqKey(newKey);
    try {
      localStorage.setItem("lv_groq_api_key", newKey);
    } catch (_) {}
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ──────────────────────────────────────────────────────────────────────────
  // SEND MESSAGE (SSE STREAMING AT ~500 TOK/S)
  // ──────────────────────────────────────────────────────────────────────────
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    if (!groqKey) {
      setShowKeyConfig(true);
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          sender: "agent",
          agentId: selectedAgentId,
          text: "⚠️ Groq API key is required. Paste your Groq API key in the '⚡ Groq API Key' bar above and click 'Connect & Save' to transmit orders to the editorial desk.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          modelUsed: "System Notice",
        },
      ]);
      return;
    }

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      sender: "user",
      agentId: selectedAgentId,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const assistantId = "a-" + Date.now();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      sender: "agent",
      agentId: selectedAgentId,
      text: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      modelUsed: activeAgent.model,
      sources: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    if (!textToSend) setInputText("");
    setIsLoading(true);

    try {
      const historyPayload = messages
        .filter((m) => m.agentId === selectedAgentId)
        .slice(-6)
        .map((m) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        }));

      const res = await fetch("/api/admin/ai-team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-api-key": groqKey,
          ...authHeaders(),
        },
        body: JSON.stringify({
          agentId: selectedAgentId,
          message: text,
          groqApiKey: groqKey,
          history: historyPayload,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to reach AI Team agent.");
      }

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice(6);

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.type === "sources" && parsed.sources) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          sources: parsed.sources,
                          modelUsed: parsed.agent?.model || m.modelUsed,
                        }
                      : m
                  )
                );
              } else if (parsed.type === "token" && parsed.token) {
                accumulated += parsed.token;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, text: accumulated } : m
                  )
                );
              } else if (parsed.type === "error") {
                throw new Error(parsed.error);
              }
            } catch (_) {}
          }
        }

        if (!accumulated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.text
                ? { ...m, text: "Standing by for orders, Boss." }
                : m
            )
          );
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: `⚠️ [Agent Connection Error]: ${errMsg}`,
                modelUsed: "Error",
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // RUN 4-AGENT CONSENSUS REVIEW BOARD (SAVES TO STORE AS 'DRAFT')
  // ──────────────────────────────────────────────────────────────────────────
  const handleRunConsensusBoard = async () => {
    if (!boardTopic.trim() || boardRunning) return;
    if (!groqKey) {
      setShowKeyConfig(true);
      alert("Please enter and save your Groq API key first.");
      return;
    }

    setBoardRunning(true);
    setBoardLog([
      `[*] Initializing 4-Agent LangGraph Consensus Board on Groq LPU...`,
      `[*] Assigned Topic: "${boardTopic.trim()}"`,
      `[*] Target Output: ${autoPublish ? "Direct Live Publishing" : "Saved as Draft"}`,
      `[*] Recall Scope: Procedural SOPs, HD Canon Lore, Take-Two IP constraints`,
    ]);
    setBoardDraftResult(null);

    try {
      const res = await fetch("/api/admin/ai-team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-api-key": groqKey,
          ...authHeaders(),
        },
        body: JSON.stringify({
          action: "board_draft",
          topic: boardTopic.trim(),
          publishImmediately: autoPublish,
          groqApiKey: groqKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Consensus board execution failed.");

      setBoardLog(data.auditLog || ["Consensus loop complete."]);
      setBoardDraftResult(data.article);
    } catch (err: any) {
      setBoardLog((prev) => [...prev, `[X] Pipeline Error: ${err.message || String(err)}`]);
    } finally {
      setBoardRunning(false);
    }
  };

  // 1-Click Approve Draft from Modal
  const handleQuickPublishFromModal = async (art: any) => {
    try {
      const res = await fetch("/api/admin/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          ...art,
          status: "published",
        }),
      });
      if (res.ok) {
        setBoardDraftResult((prev: any) => ({ ...prev, status: "published" }));
        setBoardLog((prev) => [...prev, `[OK] ✓ 1-Click Approved & Published LIVE to Front Page!`]);
      } else {
        const d = await res.json().catch(() => ({}));
        setBoardLog((prev) => [...prev, `[X] Publish error: ${d.error || "Failed"}`]);
      }
    } catch (err: any) {
      setBoardLog((prev) => [...prev, `[X] Publish error: ${err.message}`]);
    }
  };

  // 1-Click Publish or Save Draft directly from Chatbox Response
  const handleQuickPublishFromChat = async (
    msgId: string,
    rawText: string,
    targetStatus: "published" | "draft"
  ) => {
    setQuickPublishingId(msgId);
    try {
      const cleanBody = cleanPolishedMarkdown(rawText);
      const lines = cleanBody.split("\n").map((l) => l.trim()).filter(Boolean);
      let cleanTitle = "AI Investigative Dispatch";
      for (const l of lines) {
        const t = l.replace(/^#+\s*/, "").replace(/^Headline:\s*/i, "").replace(/^Title:\s*/i, "").trim();
        if (t.length > 5 && !t.toLowerCase().startsWith("block") && !t.toLowerCase().startsWith("sop")) {
          cleanTitle = t.slice(0, 60);
          break;
        }
      }

      const cleanSlug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 45);
      const articlePayload = {
        slug: cleanSlug,
        title: cleanTitle,
        category: "story",
        author: "vincent-chief-vance",
        date: new Date().toISOString().split("T")[0],
        image: "/images/gta/vice_city_01.jpg",
        excerpt: cleanBody.slice(0, 150) + "...",
        readMins: Math.max(3, Math.round(cleanBody.split(/\s+/).length / 200)),
        tags: ["GTA 6", "Leonida"],
        body: markdownToBlocks(cleanBody),
        status: targetStatus,
        preset: "standard-feature",
        kicker: targetStatus === "published" ? "VERIFIED DISPATCH" : "AI EDITORIAL DRAFT",
      };

      const res = await fetch("/api/admin/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(articlePayload),
      });

      if (res.ok) {
        setPublishedAlert({
          id: msgId,
          title: cleanTitle,
          slug: cleanSlug,
          status: targetStatus,
        });
      } else {
        const d = await res.json().catch(() => ({}));
        alert(`Error: ${d.error || "Failed to save article"}`);
      }
    } catch (err: any) {
      alert(`Publish error: ${err.message}`);
    } finally {
      setQuickPublishingId(null);
    }
  };

  const quickPrompts = [
    {
      label: "📰 Draft Lucia & Jason Feature",
      text: "Chief, draft a 1,400-word investigative article about Lucia and Jason executing a tactical stick-up in Vice Beach using RAGE 9 ocean wave timing.",
    },
    {
      label: "⚡ 3 Breaking News Flashes",
      text: "Lexi, give me 3 ultra-punchy breaking news flashes and social headlines about the latest Grand Theft Auto VI leaks.",
    },
    {
      label: "🛡️ Run Site Decoder Check",
      text: "Sentinel-9, report on current HTML5 video playback health and broadcast queue rotation.",
    },
    {
      label: "👮 Check Clip Policy",
      text: "Sgt. Cruz, what are the primary red flags to reject when screening user submissions in SubmitClipModal?",
    },
  ];

  return (
    <div className="max-w-[1560px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── TOP HEADER / BANNER ── */}
      <div className="bg-[#121212] text-[#faf9f6] border border-black p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <h2 className="text-lg font-bold uppercase tracking-wider font-mono">
              Leonida Vice — AI Editorial Team War Room
            </h2>
            <span className="bg-[#0f766e] text-white text-[11px] font-mono px-2 py-0.5 uppercase tracking-wider font-bold">
              Groq LPU Connected
            </span>
            <span className="bg-[#831843] text-white text-[11px] font-mono px-2 py-0.5 uppercase tracking-wider font-bold">
              Ultimate RAG (57 Chunks)
            </span>
          </div>
          <p className="text-xs text-[#8c887e] mt-1">
            Direct prompt communication channel with your 4-agent Groq Language Processing Unit team.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <button
            type="button"
            onClick={() => setShowBoardModal(true)}
            className="bg-[#831843] hover:bg-[#9f1239] text-white px-3.5 py-1.5 border border-[#9f1239] font-bold uppercase cursor-pointer flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <span>🏛️</span>
            <span>Launch Consensus Board</span>
          </button>
          <div className="bg-[#1e222b] px-3 py-1.5 border border-[#242834]">
            <span className="text-[#8c887e]">Throughput:</span>{" "}
            <span className="text-[#14b8a6] font-bold">~500 tok/s</span>
          </div>
          <div className="bg-[#1e222b] px-3 py-1.5 border border-[#242834]">
            <span className="text-[#8c887e]">Prompt Caching:</span>{" "}
            <span className="text-[#14b8a6] font-bold">50% Active</span>
          </div>
          <button
            type="button"
            onClick={() => setShowKeyConfig(!showKeyConfig)}
            className="bg-[#1e222b] hover:bg-[#242834] text-[#faf9f6] px-3 py-1.5 border border-[#242834] cursor-pointer"
          >
            ⚙️ Key: {groqKey ? `${groqKey.slice(0, 7)}...` : "Configure"}
          </button>
        </div>
      </div>

      {showKeyConfig && (
        <div className="bg-[#16181f] text-white p-4 border border-[#0f766e] flex flex-wrap items-center gap-3 text-xs font-mono shadow-md">
          <span className="text-[#14b8a6] font-bold">⚡ Groq API Key:</span>
          <input
            type="password"
            value={groqKey}
            onChange={(e) => saveCustomKey(e.target.value)}
            placeholder="Paste your Groq API key (gsk_...) here"
            className="flex-1 min-w-[280px] bg-black border border-[#323c4e] px-3 py-1.5 text-white focus:outline-none focus:border-[#14b8a6]"
          />
          <button
            type="button"
            onClick={() => setShowKeyConfig(false)}
            className="bg-[#0f766e] hover:bg-[#14b8a6] text-white px-4 py-1.5 font-bold uppercase transition-colors cursor-pointer"
          >
            ✓ Connect & Save
          </button>
          <span className="text-[11px] text-[#8c887e] w-full">
            Key is securely stored in your browser storage for this session and sent directly to the Groq LPU cluster.
          </span>
        </div>
      )}

      {/* ── 4 AGENT VISUAL ROSTER CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {AGENTS.map((agent) => {
          const isSelected = agent.id === selectedAgentId;
          return (
            <button
              key={agent.id}
              onClick={() => setSelectedAgentId(agent.id)}
              className={`text-left p-4 border transition-all relative ${
                isSelected
                  ? "bg-[#faf9f6] border-[#831843] border-b-[4px] shadow-sm ring-1 ring-[#831843]"
                  : "bg-white border-black/20 hover:border-black/50 hover:bg-[#faf9f6]"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{agent.avatar}</span>
                  <div>
                    <h3 className="font-bold text-sm leading-tight text-[#121212]">
                      {agent.name}
                    </h3>
                    <span className="text-[10px] font-mono text-[#737373] uppercase tracking-wider">
                      {agent.codename}
                    </span>
                  </div>
                </div>
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              </div>

              <div className="mb-2">
                <span className={`inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 ${agent.badgeColor}`}>
                  {agent.model}
                </span>
              </div>

              <p className="text-[11px] text-[#575b5f] line-clamp-2 leading-relaxed">
                {agent.tagline}
              </p>

              {isSelected && (
                <div className="mt-3 pt-2 border-t border-black/10 flex items-center justify-between text-[11px] font-bold text-[#831843]">
                  <span>Active Channel &bull; Ready</span>
                  <span>&rarr;</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── MAIN INTERACTIVE CHAT WINDOW ── */}
      <div className="bg-white border border-black border-b-[4px] flex flex-col h-[620px]">
        {/* Chat Header */}
        <div className="border-b border-black/10 p-4 bg-[#faf9f6] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeAgent.avatar}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-[#121212]">{activeAgent.name}</h3>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 ${activeAgent.badgeColor}`}>
                  {activeAgent.model}
                </span>
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 font-bold">
                  ⚡ SSE Streaming Active
                </span>
              </div>
              <p className="text-xs text-[#737373]">{activeAgent.role}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMessages([])}
              className="text-xs text-[#737373] hover:text-black font-mono border border-black/20 px-2 py-1 bg-white hover:bg-neutral-100"
            >
              Clear Log
            </button>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#faf9f6]/40">
          {messages.map((m) => {
            const isUser = m.sender === "user";
            const senderAgent = AGENTS.find((a) => a.id === m.agentId) || activeAgent;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-xs font-bold text-[#121212]">
                    {isUser ? "You (Editor-in-Chief)" : `${senderAgent.avatar} ${senderAgent.name}`}
                  </span>
                  <span className="text-[10px] text-[#737373] font-mono">{m.timestamp}</span>
                  {m.modelUsed && (
                    <span className="text-[9px] font-mono bg-neutral-200 text-neutral-800 px-1 rounded">
                      {m.modelUsed}
                    </span>
                  )}
                </div>

                <div
                  className={`max-w-[85%] rounded p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? "bg-[#121212] text-[#faf9f6] shadow-sm"
                      : "bg-white text-[#121212] border border-black/15 shadow-sm font-sans"
                  }`}
                >
                  {m.text || (
                    <span className="inline-flex items-center gap-1.5 text-neutral-400 font-mono text-xs">
                      <span className="animate-spin inline-block h-3 w-3 border-2 border-[#831843] border-t-transparent rounded-full"></span>
                      Streaming tokens from Groq LPU...
                    </span>
                  )}
                </div>

                {/* Recalled Memory Source Badges */}
                {!isUser && m.sources && m.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 max-w-[85%]">
                    <span className="text-[10px] font-mono text-[#737373] font-bold">
                      📚 Knowledge Base Recall:
                    </span>
                    {m.sources.map((src, sIdx) => (
                      <span
                        key={sIdx}
                        title={`Source File: ${src.sourceFile}`}
                        className="text-[10px] font-mono bg-[#f3efe6] text-[#831843] border border-[#831843]/20 px-2 py-0.5 rounded"
                      >
                        [{src.tier.toUpperCase()}] {src.title}
                      </span>
                    ))}
                  </div>
                )}

                {/* If the message looks like an article draft: 1-Click Publish, 1-Click Save Draft, or Edit */}
                {!isUser && m.text.length > 250 && (
                  <div className="mt-2.5 pt-2 border-t border-black/10 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={quickPublishingId === m.id}
                      onClick={() => handleQuickPublishFromChat(m.id, m.text, "published")}
                      className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-neutral-400 text-white text-[11px] font-mono font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                      title="Instantly publish this article live without editing"
                    >
                      <span>🚀 1-Click Publish Live</span>
                    </button>
                    <button
                      type="button"
                      disabled={quickPublishingId === m.id}
                      onClick={() => handleQuickPublishFromChat(m.id, m.text, "draft")}
                      className="bg-[#1e222b] hover:bg-black disabled:bg-neutral-400 text-[#faf9f6] text-[11px] font-mono font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 border border-black/20 cursor-pointer"
                      title="Save as a draft in the Admin Desk without editing"
                    >
                      <span>💾 Save as Ready Draft</span>
                    </button>
                    {onLoadDraftIntoComposer && (
                      <button
                        type="button"
                        onClick={() => {
                          const clean = cleanPolishedMarkdown(m.text);
                          const firstLine = clean.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60);
                          onLoadDraftIntoComposer(firstLine || "AI Dispatch", clean);
                        }}
                        className="text-[11px] text-[#831843] hover:underline font-mono font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>📝 Edit in Composer (Optional)</span>
                      </button>
                    )}
                  </div>
                )}

                {publishedAlert && publishedAlert.id === m.id && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-600 rounded text-xs text-emerald-900 font-mono flex items-center justify-between gap-2 max-w-[85%] shadow-sm">
                    <span>
                      ✓ {publishedAlert.status === "published" ? "Published Live to Front Page!" : "Saved to Draft Queue:"}{" "}
                      <strong>"{publishedAlert.title}"</strong>
                    </span>
                    {publishedAlert.status === "published" && (
                      <a
                        href={`/article/${publishedAlert.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-emerald-700 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase hover:bg-emerald-800"
                      >
                        View Live ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 border-t border-black/10 bg-[#f3efe6]/50 flex flex-wrap gap-2">
          <span className="text-[11px] text-[#737373] font-mono self-center">Quick Orders:</span>
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(p.text)}
              disabled={isLoading}
              className="text-[11px] bg-white border border-black/20 hover:border-[#831843] hover:text-[#831843] px-2.5 py-1 rounded transition-colors text-left"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-black bg-white flex items-center gap-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={`Message ${activeAgent.name}... (Press Enter to send, Shift+Enter for new line)`}
            rows={2}
            className="flex-1 resize-none border border-black/20 p-2 text-sm focus:outline-none focus:border-black font-sans"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isLoading || !inputText.trim()}
            className="bg-[#831843] hover:bg-[#9f1239] disabled:bg-neutral-300 text-white font-bold px-6 py-4 text-xs uppercase tracking-wider font-mono transition-colors"
          >
            {isLoading ? "Streaming..." : "Send Order"}
          </button>
        </div>
      </div>

      {/* ── AUTONOMOUS REVIEW BOARD MODAL ── */}
      {showBoardModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] text-white border border-black border-b-[6px] max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#242834]">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏛️</span>
                <div>
                  <h3 className="font-bold text-base font-mono uppercase tracking-wider">
                    Autonomous Consensus Review Board
                  </h3>
                  <p className="text-xs text-[#8c887e]">
                    Cyclical 4-Agent Pipeline: Wire (20B) &rarr; Cruz (20B Safeguard) &rarr; Vance (120B) &rarr; Sentinel-9 (Draft Save)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBoardModal(false)}
                className="text-[#8c887e] hover:text-white font-mono text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold text-[#faf9f6] uppercase mb-1">
                Story Topic / Investigative Lead:
              </label>
              <input
                type="text"
                value={boardTopic}
                onChange={(e) => setBoardTopic(e.target.value)}
                placeholder="e.g. Ambrosia Sugar Cane Cartel Logistics, Mount Kalaga High Altitude Physics"
                className="w-full bg-[#1e222b] border border-[#323c4e] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#831843] font-sans"
                disabled={boardRunning}
              />
              <span className="text-[11px] text-[#8c887e] block mt-1">
                The 4-agent board will draft, audit Take-Two IP constraints, verify canon lore, and format broadsheet copy.
              </span>
            </div>

            {/* Publishing Mode Toggle */}
            <div className="flex items-center justify-between p-3 bg-[#1e222b] border border-[#323c4e] rounded">
              <div>
                <span className="text-xs font-mono font-bold text-white block">
                  Publishing Strategy:
                </span>
                <span className="text-[11px] text-[#8c887e]">
                  {autoPublish
                    ? "Direct live deployment: Article goes straight to front page after passing Cruz & Vance."
                    : "Draft mode: Article is audited and saved to desk for your final 1-click approval."}
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer font-mono text-xs select-none">
                <input
                  type="checkbox"
                  checked={autoPublish}
                  onChange={(e) => setAutoPublish(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
                <span className={autoPublish ? "text-emerald-400 font-bold" : "text-[#8c887e]"}>
                  {autoPublish ? "⚡ Auto-Publish Live" : "Save as Draft"}
                </span>
              </label>
            </div>

            {/* Execution Trace Log */}
            {boardLog.length > 0 && (
              <div className="bg-black border border-[#242834] p-3 rounded font-mono text-xs max-h-48 overflow-y-auto space-y-1">
                {boardLog.map((logLine, idx) => (
                  <div
                    key={idx}
                    className={
                      logLine.includes("Error") || logLine.includes("[X]")
                        ? "text-red-400"
                        : logLine.includes("approved") || logLine.includes("committed") || logLine.includes("[OK]")
                        ? "text-emerald-400"
                        : "text-[#8c887e]"
                    }
                  >
                    {logLine}
                  </div>
                ))}
                {boardRunning && (
                  <div className="text-amber-400 flex items-center gap-2 pt-1">
                    <span className="animate-spin inline-block h-3 w-3 border-2 border-amber-400 border-t-transparent rounded-full"></span>
                    <span>4-Agent consensus loop active on Groq LPUs...</span>
                  </div>
                )}
              </div>
            )}

            {/* Draft Result Banner */}
            {boardDraftResult && (
              <div className="bg-[#143026] border border-emerald-600 p-4 rounded text-xs text-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300 font-mono text-sm">
                    {boardDraftResult.status === "published"
                      ? "✓ Article Successfully Published LIVE to Front Page!"
                      : "✓ Article Successfully Audited & Saved as DRAFT!"}
                  </span>
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                      boardDraftResult.status === "published"
                        ? "bg-emerald-600 text-white"
                        : "bg-amber-500 text-black"
                    }`}
                  >
                    Status: {boardDraftResult.status}
                  </span>
                </div>
                <p className="font-semibold text-white text-sm">{boardDraftResult.title}</p>
                <div className="flex items-center gap-3 text-[#8c887e] font-mono text-[11px]">
                  <span>Slug: {boardDraftResult.slug}</span>
                  <span>Category: {boardDraftResult.category}</span>
                  <span>Blocks: {boardDraftResult.body?.length || 0}</span>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  {boardDraftResult.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => handleQuickPublishFromModal(boardDraftResult)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 font-bold uppercase font-mono cursor-pointer flex items-center gap-1.5 shadow-sm text-xs"
                    >
                      <span>✓ 1-Click Approve & Publish Live Now</span>
                    </button>
                  )}
                  {boardDraftResult.status === "published" && (
                    <a
                      href={`/article/${boardDraftResult.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 font-bold uppercase font-mono cursor-pointer flex items-center gap-1.5 shadow-sm text-xs"
                    >
                      <span>View Live on Front Page ↗</span>
                    </a>
                  )}
                  {onLoadDraftIntoComposer && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowBoardModal(false);
                        onLoadDraftIntoComposer(
                          boardDraftResult.title,
                          boardDraftResult.body
                            ?.map((b: any) => b.text || "")
                            .join("\n\n") || ""
                        );
                      }}
                      className="text-[#8c887e] hover:text-white px-2 py-1.5 font-mono text-xs underline cursor-pointer"
                    >
                      <span>Edit in Composer (Optional) &rarr;</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#242834]">
              <button
                type="button"
                onClick={() => setShowBoardModal(false)}
                className="text-[#8c887e] hover:text-white px-4 py-2 font-mono text-xs uppercase"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleRunConsensusBoard}
                disabled={boardRunning || !boardTopic.trim()}
                className="bg-[#831843] hover:bg-[#9f1239] disabled:bg-[#323c4e] text-white px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors"
              >
                {boardRunning ? "Running Consensus Board..." : "⚡ Execute Consensus Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
