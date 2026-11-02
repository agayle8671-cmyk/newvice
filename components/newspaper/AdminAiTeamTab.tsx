"use client";

import React, { useState, useRef, useEffect } from "react";

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

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  agentId: string;
  text: string;
  timestamp: string;
  modelUsed?: string;
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
      text: "Boss, Vincent Vance reporting in from the Managing Desk. The Groq LPU cluster is primed. Give me a topic, and I'll draft an investigative piece, or ask Lexi for rapid breaking news. What are our orders?",
      timestamp: "Just now",
      modelUsed: "openai/gpt-oss-120b",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [groqKey, setGroqKey] = useState<string>("");
  const [showKeyConfig, setShowKeyConfig] = useState(false);
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

    setMessages((prev) => [...prev, userMsg]);
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reach AI Team agent.");
      }

      const agentReply: ChatMessage = {
        id: "a-" + Date.now(),
        sender: "agent",
        agentId: selectedAgentId,
        text: data.reply || "Standing by.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        modelUsed: data.agent?.model || activeAgent.model,
      };

      setMessages((prev) => [...prev, agentReply]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          sender: "agent",
          agentId: selectedAgentId,
          text: `⚠️ [Agent Connection Error]: ${errMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    { label: "📰 Draft Lucia & Jason Feature", text: "Chief, draft a 1,400-word investigative article about Lucia and Jason executing a tactical stick-up in Vice Beach using RAGE 9 ocean wave timing." },
    { label: "⚡ 3 Breaking News Flashes", text: "Lexi, give me 3 ultra-punchy breaking news flashes and social headlines about the latest Grand Theft Auto VI leaks." },
    { label: "🛡️ Run Site Decoder Check", text: "Sentinel-9, report on current HTML5 video playback health and broadcast queue rotation." },
    { label: "👮 Check Clip Policy", text: "Sgt. Cruz, what are the primary red flags to reject when screening user submissions in SubmitClipModal?" },
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
          </div>
          <p className="text-xs text-[#8c887e] mt-1">
            Direct prompt communication channel with your 4-agent Groq Language Processing Unit team.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
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
                  {m.text}
                </div>

                {/* If the message looks like an article draft and composer callback exists */}
                {!isUser && onLoadDraftIntoComposer && m.text.length > 250 && (
                  <button
                    onClick={() => {
                      const firstLine = m.text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60);
                      onLoadDraftIntoComposer(firstLine || "AI Draft", m.text);
                    }}
                    className="mt-1 text-[11px] text-[#831843] hover:underline font-mono font-bold flex items-center gap-1"
                  >
                    <span>📝 Load This Draft Into Composer Tab &rarr;</span>
                  </button>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2 mb-1 px-1 text-xs text-[#737373]">
                <span>{activeAgent.avatar} {activeAgent.name} is thinking on Groq LPU...</span>
              </div>
              <div className="bg-white border border-black/15 rounded p-3 text-xs text-[#737373] flex items-center gap-2 font-mono">
                <span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-[#831843] border-t-transparent rounded-full"></span>
                <span>Generating high-throughput tokens (~500 tok/sec)...</span>
              </div>
            </div>
          )}
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
            {isLoading ? "Running..." : "Send Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
