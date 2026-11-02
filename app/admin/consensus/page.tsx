"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import AdminAiTeamTab from "@/components/newspaper/AdminAiTeamTab";
import { getSupabaseReader } from "@/lib/supabase/admin";

export default function ConsensusRoomPage() {
  const [sessionToken, setSessionToken] = useState<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sb-ylinzijawuzvnkzucoxf-auth-token");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.access_token) {
          setSessionToken(parsed.access_token);
        }
      }
    } catch (_) {}
  }, []);

  const authHeaders = (): HeadersInit => {
    const h: Record<string, string> = {};
    if (sessionToken) {
      h["Authorization"] = `Bearer ${sessionToken}`;
    }
    return h;
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-[#161b22] border-b border-[#30363d] px-4 md:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-xs font-mono text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <span>← Back to Newsroom Studio</span>
          </Link>
          <span className="text-slate-600">|</span>
          <span className="text-xs font-serif font-black tracking-wider uppercase text-white">
            LEONIDA VICE CONSENSUS ROOM
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <Link
            href="/"
            target="_blank"
            className="text-slate-400 hover:text-white transition-colors"
          >
            Public Site ↗
          </Link>
          <Link
            href="/admin"
            className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] text-slate-200 rounded font-bold transition-colors"
          >
            Admin Desk
          </Link>
        </div>
      </header>

      {/* Main Full-Page Consensus Command Center */}
      <main className="flex-1">
        <AdminAiTeamTab
          authHeaders={authHeaders}
          isStandalonePage={true}
        />
      </main>
    </div>
  );
}
