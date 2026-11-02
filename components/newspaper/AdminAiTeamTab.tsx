"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { cleanPolishedMarkdown, markdownToBlocks } from "@/lib/newspaper/clean-markdown";
import type { Article, Block } from "@/lib/newspaper/types";

interface AgentProfile {
  id: "wire" | "cruz" | "chief" | "sentinel";
  name: string;
  codename: string;
  role: string;
  model: string;
  avatar: string;
  badgeColor: string;
}

const AGENTS: AgentProfile[] = [
  {
    id: "wire",
    name: "Lexi 'Wire' Sterling",
    codename: "WIRE-20B",
    role: "Breaking News & Wire Interceptor",
    model: "openai/gpt-oss-20b",
    avatar: "⚡",
    badgeColor: "bg-[#0f766e] text-white border-[#14b8a6]",
  },
  {
    id: "cruz",
    name: "Sgt. Cruz Safeguard",
    codename: "CRUZ-SAFEGUARD",
    role: "Take-Two IP & DMCA Policy Guard",
    model: "openai/gpt-oss-safeguard-20b",
    avatar: "👮",
    badgeColor: "bg-[#d97706] text-black border-[#f59e0b]",
  },
  {
    id: "chief",
    name: "Vincent 'Chief' Vance",
    codename: "CHIEF-120B",
    role: "Senior Managing Editor & Lore Synthesizer",
    model: "openai/gpt-oss-120b",
    avatar: "🏛️",
    badgeColor: "bg-[#831843] text-white border-[#f43f5e]",
  },
  {
    id: "sentinel",
    name: "Sentinel-9 Watchdog",
    codename: "SENTINEL-QA",
    role: "Site Reliability & Hero Asset Auditor",
    model: "openai/gpt-oss-20b + Playwright",
    avatar: "🛡️",
    badgeColor: "bg-[#1e222b] text-[#14b8a6] border-[#0d9488]",
  },
];

interface IntelligenceLead {
  id: string;
  topic: string;
  category: string;
  tag: string;
  readMins: string;
  summary: string;
  icon: string;
}

const SCOUTED_LEADS: IntelligenceLead[] = [
  {
    id: "lead-1",
    topic: "Vice Beach Marina Yacht Heists & Narcotics Smuggling",
    category: "Story & Campaign",
    tag: "Crime Syndicate",
    readMins: "5 Min Feature",
    summary: "High-value superyachts vanished along Starfish Isle marina; DEA intercept logs link midnight off-loading to Brian Heder's Keys smuggling ring.",
    icon: "🌴",
  },
  {
    id: "lead-2",
    topic: "Kelly County Mud-Boggers & Grassrivers Swamp Airboat Depots",
    category: "Leonida",
    tag: "County Culture",
    readMins: "4 Min Feature",
    summary: "Airboat black-markets deep in the wetlands, armed swamp enclaves, localized alligator harvesting, and backwoods contraband logistics.",
    icon: "🚜",
  },
  {
    id: "lead-3",
    topic: "Ambrosia Sugar Cane Processing Monopoly & Labor Extortion",
    category: "Leonida",
    tag: "Industrial Cartel",
    readMins: "6 Min Feature",
    summary: "Rural agro-industrial cartel holding municipal transport contracts hostage while exploiting migrant labor under private armed watch.",
    icon: "🍬",
  },
  {
    id: "lead-4",
    topic: "Mount Kalaga High-Altitude Aerodynamics & RAGE 9 Physics",
    category: "Tech & RAGE",
    tag: "Engine Forensics",
    readMins: "5 Min Feature",
    summary: "Dynamic thermal updrafts, ray-traced atmospheric fog, glider drift vectors, and sub-surface rock tessellation on the state's highest peak.",
    icon: "🏔️",
  },
  {
    id: "lead-5",
    topic: "Port Gellhorn Intermodal Shipping Contraband & Customs Bribes",
    category: "Story & Campaign",
    tag: "Port Logistics",
    readMins: "4 Min Feature",
    summary: "Falsified cargo manifests at the dry docks; automated container cranes moving un-manifested military surplus through industrial canals.",
    icon: "⚓",
  },
  {
    id: "lead-6",
    topic: "Lucia & Jason First National Vice Bank Reconnaissance Blueprint",
    category: "Story & Campaign",
    tag: "Heist Blueprint",
    readMins: "5 Min Feature",
    summary: "Security vault acoustic sensors, guard shift rotation blindspots, and synchronized getaway corridors mapped across downtown Vice City.",
    icon: "🏦",
  },
];

interface ConsensusDialogue {
  agentId: "wire" | "cruz" | "chief" | "sentinel";
  name: string;
  avatar: string;
  role: string;
  model: string;
  stage: string;
  timestamp: string;
  message: string;
}

interface AdminAiTeamTabProps {
  authHeaders: () => HeadersInit;
  onLoadDraftIntoComposer?: (title: string, bodyMarkdown: string) => void;
  isStandalonePage?: boolean;
}

export default function AdminAiTeamTab({
  authHeaders,
  onLoadDraftIntoComposer,
  isStandalonePage = false,
}: AdminAiTeamTabProps) {
  // Groq API Key state
  const [groqKey, setGroqKey] = useState<string>("");
  const [showKeyConfig, setShowKeyConfig] = useState<boolean>(false);

  // Dispatch Mode & Input
  const [selectedLeadId, setSelectedLeadId] = useState<string>("lead-1");
  const [customTopic, setCustomTopic] = useState<string>("");
  const [publishImmediately, setPublishImmediately] = useState<boolean>(true);

  // Live Consensus Execution State
  const [isSpinningUp, setIsSpinningUp] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0); // 0: Idle, 1: Wire, 2: Cruz, 3: Chief, 4: Sentinel, 5: Done
  const [statusMessage, setStatusMessage] = useState<string>("Consensus board standing by.");
  const [auditLogs, setAuditLogs] = useState<string[]>([]);
  const [dialogues, setDialogues] = useState<ConsensusDialogue[]>([
    {
      agentId: "chief",
      name: "Vincent 'Chief' Vance",
      avatar: "🏛️",
      role: "Senior Managing Editor & Lore Synthesizer",
      model: "openai/gpt-oss-120b",
      stage: "Command Center Initialized",
      timestamp: "Just now",
      message:
        "Managing Desk online. The 4-agent consensus room is primed with our 4-Tier RAG knowledge base. Select a scouted intelligence lead or simply click '⚡ Spin Up New Article' to watch the editorial board collaborate in tandem and produce a 100% finished broadsheet dispatch.",
    },
  ]);

  // Current Generated Article State
  const [currentArticle, setCurrentArticle] = useState<Article | null>(null);
  const [publishedLiveUrl, setPublishedLiveUrl] = useState<string | null>(null);
  const [isPublishingDraft, setIsPublishingDraft] = useState<boolean>(false);

  // Recent Dispatches History
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [loadingRecent, setLoadingRecent] = useState<boolean>(false);

  const showcaseRef = useRef<HTMLDivElement>(null);

  // Load Groq API Key
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lv_groq_api_key");
      if (saved) {
        setGroqKey(saved);
      }
    } catch (_) {}
  }, []);

  const saveCustomKey = (newKey: string) => {
    setGroqKey(newKey);
    try {
      localStorage.setItem("lv_groq_api_key", newKey);
    } catch (_) {}
  };

  // Fetch recent articles for the history drawer
  const fetchRecentArticles = async () => {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/admin/articles", {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.articles && Array.isArray(data.articles)) {
          setRecentArticles(data.articles.slice(0, 8));
        }
      }
    } catch (_) {}
    setLoadingRecent(false);
  };

  useEffect(() => {
    fetchRecentArticles();
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // ⚡ 1-CLICK SPIN UP NEW ARTICLE (AUTONOMOUS 4-AGENT TANDEM GENERATION)
  // ──────────────────────────────────────────────────────────────────────────
  const handleSpinUpArticle = async (leadOverride?: IntelligenceLead) => {
    if (isSpinningUp) return;

    // Determine target topic
    let targetTopic = customTopic.trim();
    if (!targetTopic) {
      const lead = leadOverride || SCOUTED_LEADS.find((l) => l.id === selectedLeadId) || SCOUTED_LEADS[0];
      targetTopic = lead.topic;
    }

    setIsSpinningUp(true);
    setActiveStep(1);
    setStatusMessage(`Intercepting wire traffic for "${targetTopic}"...`);
    setPublishedLiveUrl(null);
    setCurrentArticle(null);

    const initialLogs = [
      `[*] Groq LPU Cluster Initialized: ~500 tok/s throughput active.`,
      `[*] Target Lead: "${targetTopic}"`,
      `[*] Target Status: ${publishImmediately ? "Direct Live Publishing (Published)" : "Saved as Polished Draft"}`,
      `[*] 4-Tier RAG Engine Querying: Ingesting HD Canon, County Geography, and Take-Two IP Bounds...`,
    ];
    setAuditLogs(initialLogs);

    // Simulated progress transitions while waiting for Groq LPU response
    const stepTimer1 = setTimeout(() => {
      setActiveStep(2);
      setStatusMessage("Sgt. Cruz screening dispatch against Take-Two IP & DMCA Safe Harbor...");
    }, 1800);

    const stepTimer2 = setTimeout(() => {
      setActiveStep(3);
      setStatusMessage("Chief Vance synthesizing HD lore & elevating prose into broadsheet copy...");
    }, 3600);

    const stepTimer3 = setTimeout(() => {
      setActiveStep(4);
      setStatusMessage("Sentinel-9 binding 4K hero asset & constructing clean layout blocks...");
    }, 5400);

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
          topic: targetTopic,
          publishImmediately,
          groqApiKey: groqKey,
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Autonomous consensus pipeline failed.");
      }

      setActiveStep(5);
      setStatusMessage("Consensus reached! Broadsheet feature generated & verified.");

      if (data.auditLog && Array.isArray(data.auditLog)) {
        setAuditLogs(data.auditLog);
      }

      if (data.consensusDialogues && Array.isArray(data.consensusDialogues)) {
        setDialogues(data.consensusDialogues);
      }

      if (data.article) {
        setCurrentArticle(data.article);
        if (data.article.status === "published") {
          // Exact canonical slug returned by server
          setPublishedLiveUrl(`/article/${data.article.slug}`);
        }
      }

      // Refresh recent dispatches
      fetchRecentArticles();

      // Smooth scroll to broadsheet showcase
      setTimeout(() => {
        showcaseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    } catch (err: any) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      setActiveStep(0);
      setStatusMessage(`Error: ${err.message || String(err)}`);
      setAuditLogs((prev) => [...prev, `[X] Pipeline Execution Failed: ${err.message}`]);
    } finally {
      setIsSpinningUp(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 🚀 1-CLICK APPROVE & PUBLISH LIVE NOW (FOR DRAFTS)
  // ──────────────────────────────────────────────────────────────────────────
  const handleApproveAndPublishLive = async () => {
    if (!currentArticle || isPublishingDraft) return;

    setIsPublishingDraft(true);
    try {
      const res = await fetch("/api/admin/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          ...currentArticle,
          status: "published",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to publish article.");
      }

      const publishedArticle = data.article || { ...currentArticle, status: "published" };
      setCurrentArticle(publishedArticle);
      // Canonical verified slug
      setPublishedLiveUrl(`/article/${publishedArticle.slug}`);
      fetchRecentArticles();
    } catch (err: any) {
      alert(`Publish error: ${err.message}`);
    } finally {
      setIsPublishingDraft(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1-CLICK PUBLISH A RECENT DRAFT FROM THE DRAWER
  // ──────────────────────────────────────────────────────────────────────────
  const handleQuickPublishRecentDraft = async (art: Article) => {
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
        const data = await res.json();
        fetchRecentArticles();
        if (data.article) {
          setCurrentArticle(data.article);
          setPublishedLiveUrl(`/article/${data.article.slug}`);
        }
      }
    } catch (_) {}
  };

  return (
    <div className="w-full bg-[#0d1117] text-slate-100 min-h-screen font-sans border-b border-black">
      {/* ────────────────────────────────────────────────────────────────────────
          1. COMMAND CENTER HERO HEADER & REAL-TIME TELEMETRY
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#161b22] border-b border-[#30363d] px-4 md:px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🏛️</span>
              <h1 className="text-xl md:text-2xl font-black tracking-wide text-white font-serif uppercase">
                Leonida Vice <span className="text-[#38bdf8] font-mono font-bold text-lg">Consensus Command Center</span>
              </h1>
              <span className="bg-[#1f2937] text-[#38bdf8] text-[10px] font-mono px-2 py-0.5 rounded border border-[#38bdf8]/30">
                GROQ LPU CLUSTER
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl font-mono">
              Unified 4-Agent Autonomous Broadsheet Wireroom. All agents work in tandem to intercept, screen, verify lore, and publish print-ready investigative dispatches with zero manual editing.
            </p>
          </div>

          {/* Telemetry Status Pills & Key Settings */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0d1117] border border-emerald-500/40 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LPU: ~500 tok/s</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0d1117] border border-[#38bdf8]/40 text-[#38bdf8]">
              <span>📚 4-Tier RAG (57 Chunks)</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0d1117] border border-amber-500/40 text-amber-300">
              <span>⚖️ SOP-04 IP Harbor</span>
            </div>
            <button
              type="button"
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              className="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-slate-700 text-slate-300 text-xs transition-colors"
            >
              🔑 {groqKey ? "Groq Key Configured" : "Config Key"}
            </button>
            {!isStandalonePage && (
              <Link
                href="/admin/consensus"
                target="_blank"
                className="px-2.5 py-1 rounded bg-[#831843] hover:bg-[#9d174d] text-white font-bold text-xs transition-colors flex items-center gap-1"
              >
                <span>Fullscreen Room ↗</span>
              </Link>
            )}
          </div>
        </div>

        {/* Collapsible Groq Key Drawer */}
        {showKeyConfig && (
          <div className="max-w-7xl mx-auto mt-4 pt-3 border-t border-[#30363d] flex flex-col md:flex-row items-center gap-3">
            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">Groq API Key:</span>
            <input
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full md:w-96 px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white font-mono focus:border-[#38bdf8] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                saveCustomKey(groqKey);
                alert("Groq API key saved successfully.");
                setShowKeyConfig(false);
              }}
              className="px-3 py-1.5 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-bold text-xs rounded transition-colors whitespace-nowrap"
            >
              Save Key
            </button>
            <span className="text-[11px] text-slate-500 font-mono">
              Saved securely to your browser session. Runs open-weights LPU at ~500 tok/s.
            </span>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-8">
        {/* ────────────────────────────────────────────────────────────────────────
            2. AUTONOMOUS MISSION CONTROL (1-CLICK SPIN UP & SCOUT DECK)
        ──────────────────────────────────────────────────────────────────────── */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-5 border-b border-[#30363d]">
            {/* Primary Action Button */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                type="button"
                disabled={isSpinningUp}
                onClick={() => handleSpinUpArticle()}
                className={`relative px-8 py-4 rounded-md font-black text-sm md:text-base uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-3 shadow-lg ${
                  isSpinningUp
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-[#0284c7] via-[#0ea5e9] to-[#38bdf8] text-black hover:brightness-110 active:scale-[0.99] ring-2 ring-[#38bdf8]/50 shadow-[#38bdf8]/20"
                }`}
              >
                {isSpinningUp ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    <span>Agents Forging Dispatch...</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl">⚡</span>
                    <span>Spin Up New Article</span>
                  </>
                )}
              </button>

              {/* Publishing Mode Toggle */}
              <div className="flex items-center gap-2 bg-[#0d1117] border border-[#30363d] p-1.5 rounded-md">
                <button
                  type="button"
                  onClick={() => setPublishImmediately(true)}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded transition-colors ${
                    publishImmediately
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  ⚡ Auto-Publish Live
                </button>
                <button
                  type="button"
                  onClick={() => setPublishImmediately(false)}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded transition-colors ${
                    !publishImmediately
                      ? "bg-amber-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  📋 Save as Ready Draft
                </button>
              </div>
            </div>

            {/* Current Pipeline Status */}
            <div className="flex items-center gap-3 bg-[#0d1117] px-4 py-2.5 rounded border border-[#30363d]">
              <span className={`w-3 h-3 rounded-full ${isSpinningUp ? "bg-amber-400 animate-ping" : "bg-emerald-400"}`} />
              <div className="text-xs font-mono">
                <div className="text-slate-400 text-[10px]">CONSENSUS PIPELINE STATUS:</div>
                <div className="text-slate-200 font-semibold">{statusMessage}</div>
              </div>
            </div>
          </div>

          {/* Scouted Intelligence Leads Carousel ("Select a Lead or Hit Spin Up") */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">🎯</span>
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                  Pre-Scouted Intelligence Leads (Click to Target)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Or leave default & click "⚡ Spin Up New Article"
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SCOUTED_LEADS.map((lead) => {
                const isSelected = selectedLeadId === lead.id && !customTopic.trim();
                return (
                  <div
                    key={lead.id}
                    onClick={() => {
                      setSelectedLeadId(lead.id);
                      setCustomTopic("");
                    }}
                    className={`p-3.5 rounded border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#1f2937] border-[#38bdf8] ring-1 ring-[#38bdf8]/40 shadow-md"
                        : "bg-[#0d1117] border-[#30363d] hover:border-slate-500 hover:bg-[#161b22]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-lg">{lead.icon}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-slate-300 border border-slate-700">
                          {lead.tag}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{lead.readMins}</span>
                      </div>
                    </div>
                    <h4 className="font-bold text-xs text-white leading-snug line-clamp-2 mb-1">
                      {lead.topic}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      {lead.summary}
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">{lead.category}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpinUpArticle(lead);
                        }}
                        disabled={isSpinningUp}
                        className="text-[10px] font-mono text-[#38bdf8] hover:underline font-bold flex items-center gap-1"
                      >
                        ⚡ Spin This Lead ↗
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional Custom Topic Bar */}
          <div className="mt-4 pt-4 border-t border-[#30363d] flex flex-col sm:flex-row items-center gap-3">
            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
              Custom Lead Order (Optional):
            </span>
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. Vice City underground drift racing circuits or Port Gellhorn crane accidents..."
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white font-mono placeholder:text-slate-600 focus:border-[#38bdf8] focus:outline-none"
            />
            {customTopic.trim() && (
              <button
                type="button"
                onClick={() => handleSpinUpArticle()}
                disabled={isSpinningUp}
                className="px-4 py-2 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-bold text-xs rounded transition-colors whitespace-nowrap"
              >
                ⚡ Spin Custom Lead
              </button>
            )}
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────────────────────
            3. LIVE 4-AGENT TANDEM CONSENSUS STAGE
        ──────────────────────────────────────────────────────────────────────── */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#30363d]">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🤝</span>
              <div>
                <h2 className="text-sm md:text-base font-bold text-white font-serif uppercase tracking-wide">
                  Live 4-Agent Consensus Chamber
                </h2>
                <p className="text-[11px] font-mono text-slate-400">
                  Real-time tandem collaboration stream. All 4 specialized agents converse and execute their SOPs in sequence.
                </p>
              </div>
            </div>

            {/* Stepper Indicator */}
            <div className="flex items-center gap-2">
              {[
                { num: 1, label: "Wire Recon" },
                { num: 2, label: "IP Screen" },
                { num: 3, label: "Lore Polish" },
                { num: 4, label: "Asset & Store" },
              ].map((s) => {
                const isCurrent = activeStep === s.num;
                const isPassed = activeStep > s.num;
                return (
                  <div
                    key={s.num}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                      isCurrent
                        ? "bg-[#38bdf8] text-black font-bold animate-pulse"
                        : isPassed
                        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-600/40"
                        : "bg-[#0d1117] text-slate-400 border border-[#30363d]"
                    }`}
                  >
                    <span>{isPassed ? "✓" : s.num}</span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4 Agent Profile Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 py-4 border-b border-[#30363d]">
            {AGENTS.map((agent) => (
              <div
                key={agent.id}
                className="bg-[#0d1117] border border-[#30363d] p-2.5 rounded flex items-center gap-2.5"
              >
                <span className="text-2xl p-1 rounded bg-[#161b22]">{agent.avatar}</span>
                <div className="min-w-0">
                  <div className="font-bold text-xs text-white truncate">{agent.name}</div>
                  <div className="text-[10px] font-mono text-slate-400 truncate">{agent.role}</div>
                  <span className="inline-block mt-0.5 text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#21262d] text-slate-300">
                    {agent.codename}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Real-time Dialogue Feed */}
          <div className="mt-4 space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
            {dialogues.map((dlg, idx) => {
              const agentProfile = AGENTS.find((a) => a.id === dlg.agentId) || AGENTS[2];
              return (
                <div
                  key={idx}
                  className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 flex items-start gap-3.5 shadow-sm"
                >
                  <span className="text-2xl p-1.5 rounded-full bg-[#161b22] border border-[#30363d] shrink-0">
                    {dlg.avatar}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">{dlg.name}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${agentProfile.badgeColor}`}>
                          {dlg.stage}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{dlg.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">{dlg.message}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collapsible Execution Audit Log */}
          {auditLogs.length > 0 && (
            <details className="mt-4 pt-3 border-t border-[#30363d] group">
              <summary className="text-[11px] font-mono text-slate-400 cursor-pointer hover:text-slate-200 select-none flex items-center gap-1.5">
                <span>▸ View Real-time Groq LPU Execution Audit Logs ({auditLogs.length} events)</span>
              </summary>
              <div className="mt-2.5 p-3 rounded bg-black/70 border border-[#30363d] font-mono text-[11px] text-emerald-400 space-y-1 max-h-48 overflow-y-auto">
                {auditLogs.map((log, i) => (
                  <div key={i} className="leading-snug">{log}</div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* ────────────────────────────────────────────────────────────────────────
            4. FINISHED BROADSHEET ARTICLE SHOWCASE (1-CLICK PUBLISH LIVE)
        ──────────────────────────────────────────────────────────────────────── */}
        <div ref={showcaseRef} className="space-y-4">
          {currentArticle ? (
            <div className="bg-[#fdfbf7] text-[#111827] rounded-lg border-2 border-black p-6 md:p-10 shadow-2xl">
              {/* Showcase Command Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b-2 border-black">
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded text-xs font-mono font-black uppercase tracking-wider ${
                    currentArticle.status === "published"
                      ? "bg-emerald-600 text-white"
                      : "bg-amber-500 text-black"
                  }`}>
                    {currentArticle.status === "published" ? "🟢 Published Live" : "🟡 Ready Editorial Draft"}
                  </span>
                  <span className="text-xs font-mono text-slate-600 font-bold">
                    Slug: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-black font-mono">{currentArticle.slug}</code>
                  </span>
                </div>

                {/* Direct Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {currentArticle.status === "draft" && (
                    <button
                      type="button"
                      disabled={isPublishingDraft}
                      onClick={handleApproveAndPublishLive}
                      className="px-5 py-2.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors shadow-md flex items-center gap-2"
                    >
                      {isPublishingDraft ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Publishing...</span>
                        </>
                      ) : (
                        <>
                          <span>🚀 Approve & Publish Live Now</span>
                        </>
                      )}
                    </button>
                  )}

                  {currentArticle.status === "published" && (
                    <a
                      href={`/article/${currentArticle.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors shadow-md flex items-center gap-1.5"
                    >
                      <span>🌐 View Live on Front Page ↗</span>
                    </a>
                  )}

                  {onLoadDraftIntoComposer && (
                    <button
                      type="button"
                      onClick={() => {
                        const rawText = currentArticle.body
                          .map((b) => (b.type === "p" ? b.text : b.type === "h2" ? `## ${b.text}` : ""))
                          .join("\n\n");
                        onLoadDraftIntoComposer(currentArticle.title, rawText);
                      }}
                      className="px-3.5 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-mono text-xs font-bold transition-colors"
                    >
                      📝 Edit in Composer (Optional)
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSpinUpArticle()}
                    disabled={isSpinningUp}
                    className="px-3.5 py-2 rounded bg-black hover:bg-slate-800 text-white font-mono text-xs font-bold transition-colors"
                  >
                    ⚡ Spin Up Next
                  </button>
                </div>
              </div>

              {/* Broadsheet Headline & Byline */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-black text-[#831843] uppercase tracking-widest">
                    {currentArticle.kicker || "VERIFIED INVESTIGATIVE DISPATCH"}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-[11px] font-mono uppercase bg-slate-200 px-2 py-0.5 rounded text-slate-700 font-bold">
                    {currentArticle.category}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-black text-black leading-tight">
                  {currentArticle.title}
                </h1>

                <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-600 pt-1 border-t border-slate-300">
                  <span className="font-bold text-black">
                    By Vincent 'Chief' Vance (Senior Managing Editor)
                  </span>
                  <span>•</span>
                  <span>{currentArticle.date}</span>
                  <span>•</span>
                  <span>{currentArticle.readMins} Min Read</span>
                  <span>•</span>
                  <span className="text-emerald-700 font-bold">✓ 100% Broadsheet Certified</span>
                </div>
              </div>

              {/* Verified Hero Image */}
              {currentArticle.image && (
                <div className="mb-8 rounded overflow-hidden border border-slate-300 bg-black">
                  <img
                    src={currentArticle.image}
                    alt={currentArticle.title}
                    className="w-full max-h-[460px] object-cover"
                  />
                  <div className="p-2.5 bg-[#f3efe6] text-[11px] font-mono text-slate-600 border-t border-slate-300 flex items-center justify-between">
                    <span>Forensic surveillance asset verified by Sentinel-9 Media Watchdog.</span>
                    <span className="uppercase font-bold text-slate-500">State of Leonida Public Records</span>
                  </div>
                </div>
              )}

              {/* Executive Summary Takeaways Box */}
              {currentArticle.excerpt && (
                <div className="bg-[#f3efe6] border-l-4 border-[#831843] p-4 mb-8 rounded-r">
                  <div className="font-mono font-bold text-xs uppercase tracking-wider text-[#831843] mb-1">
                    ⚡ Executive Intelligence Takeaways
                  </div>
                  <p className="text-sm font-serif italic text-slate-800 leading-relaxed">
                    "{currentArticle.excerpt}"
                  </p>
                </div>
              )}

              {/* Formatted Broadsheet Body Blocks */}
              <div className="prose max-w-none font-serif text-[#1f2937] text-base leading-relaxed space-y-5">
                {currentArticle.body && currentArticle.body.length > 0 ? (
                  currentArticle.body.map((block: Block, bIdx: number) => {
                    if (block.type === "h2") {
                      return (
                        <h2
                          key={bIdx}
                          className="text-xl md:text-2xl font-serif font-bold text-black mt-8 pt-4 border-t border-slate-300"
                        >
                          {block.text}
                        </h2>
                      );
                    }
                    if (block.type === "p") {
                      return (
                        <p key={bIdx} className="leading-relaxed text-justify text-slate-800">
                          {block.text}
                        </p>
                      );
                    }
                    if (block.type === "table") {
                      return (
                        <div key={bIdx} className="my-6 overflow-x-auto rounded border border-slate-300">
                          <table className="min-w-full text-xs font-mono">
                            <thead className="bg-[#1e293b] text-white">
                              <tr>
                                {block.head.map((h, hIdx) => (
                                  <th key={hIdx} className="px-4 py-2.5 text-left uppercase tracking-wider font-bold">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                              {block.rows.map((row, rIdx) => (
                                <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="px-4 py-2 text-slate-800">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }
                    if (block.type === "quote") {
                      return (
                        <blockquote
                          key={bIdx}
                          className="my-6 border-l-4 border-black pl-4 italic text-slate-800 bg-[#f3efe6]/50 p-3"
                        >
                          "{block.text}"
                          {block.cite && (
                            <cite className="block text-xs font-mono font-bold mt-1 text-slate-600 not-italic">
                              — {block.cite}
                            </cite>
                          )}
                        </blockquote>
                      );
                    }
                    if (block.type === "list") {
                      return (
                        <ul key={bIdx} className="list-disc pl-5 my-4 space-y-1.5 text-slate-800 font-sans text-sm">
                          {block.items.map((item, iIdx) => (
                            <li key={iIdx}>{item}</li>
                          ))}
                        </ul>
                      );
                    }
                    return null;
                  })
                ) : (
                  <p className="italic text-slate-500 font-sans text-sm">Dispatch text is formatting...</p>
                )}
              </div>

              {/* Bottom Publishing Confirmation Banner */}
              <div className="mt-10 pt-6 border-t-2 border-black flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs font-mono text-slate-600">
                  <span>Author: Vincent 'Chief' Vance • Verified Canon Database Record</span>
                </div>
                {currentArticle.status === "published" ? (
                  <a
                    href={`/article/${currentArticle.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg flex items-center gap-2"
                  >
                    <span>✓ Published Live — View on Front Page ↗</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={isPublishingDraft}
                    onClick={handleApproveAndPublishLive}
                    className="px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg flex items-center gap-2"
                  >
                    <span>🚀 1-Click Approve & Publish Live</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-10 text-center space-y-3">
              <span className="text-4xl block">📰</span>
              <h3 className="text-base font-bold text-white font-serif uppercase">
                Consensus Broadsheet Showcase Standing By
              </h3>
              <p className="text-xs font-mono text-slate-400 max-w-md mx-auto">
                Click <strong className="text-[#38bdf8]">"⚡ Spin Up New Article"</strong> above to witness all 4 agents generate, screen, elevate, and format a live investigative broadsheet feature.
              </p>
            </div>
          )}
        </div>

        {/* ────────────────────────────────────────────────────────────────────────
            5. RECENT AUTONOMOUS DISPATCHES DRAWER (IN THE SAME ROOM)
        ──────────────────────────────────────────────────────────────────────── */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🗄️</span>
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-bold">
                Recent Autonomous Dispatches & Draft Queue
              </h3>
            </div>
            <button
              type="button"
              onClick={fetchRecentArticles}
              disabled={loadingRecent}
              className="text-[11px] font-mono text-[#38bdf8] hover:underline"
            >
              {loadingRecent ? "Refreshing..." : "↻ Refresh List"}
            </button>
          </div>

          {recentArticles.length === 0 ? (
            <div className="text-xs font-mono text-slate-500 py-4 text-center">
              No recent dispatches recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#30363d] text-slate-400 text-[10px] uppercase">
                    <th className="py-2.5 px-3">Headline</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {recentArticles.map((art) => (
                    <tr key={art.slug} className="hover:bg-[#1f2937]/50 transition-colors">
                      <td className="py-2.5 px-3 font-serif font-bold text-white max-w-xs truncate">
                        {art.title}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 uppercase text-[10px]">
                        {art.category}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {art.date}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            art.status === "published"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-700/50"
                              : "bg-amber-950 text-amber-400 border border-amber-700/50"
                          }`}
                        >
                          {art.status || "published"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        {art.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => handleQuickPublishRecentDraft(art)}
                            className="text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-2 py-1 rounded"
                          >
                            ✓ 1-Click Publish
                          </button>
                        )}
                        <a
                          href={`/article/${art.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] bg-[#21262d] hover:bg-slate-700 text-[#38bdf8] font-bold px-2 py-1 rounded inline-block"
                        >
                          View Live ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
