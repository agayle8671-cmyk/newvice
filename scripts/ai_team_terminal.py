#!/usr/bin/env python3
"""
Leonida Vice — AI Editorial Team Terminal War Room
Interactive CLI interface to communicate directly with your Groq AI Team.

Roster:
1. 🏛️  Chief Vance (openai/gpt-oss-120b)     - Senior Managing Editor & Deep Lore Synthesizer
2. ⚡  Lexi Wire   (openai/gpt-oss-20b)      - Breaking News, Bullet Takeaways & Strict CMS Formatter
3. 🛡️  Sentinel-9  (Playwright + Groq)       - Site Reliability, Video Decoder QA & Link Watchdog
4. 👮  Sgt. Cruz   (gpt-oss-safeguard-20b)   - Content Moderation & Submission Safety Guard

Usage:
  python scripts/ai_team_terminal.py
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from typing import Dict, List, Any
from groq import Groq

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Load Credentials
# ---------------------------------------------------------------------------
def load_env():
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    for name in [".env.local", ".env"]:
        p = repo_root / name
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("GROQ_API_KEY=") and not line.startswith("#"):
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        os.environ["GROQ_API_KEY"] = key
                        return key
    return os.environ.get("GROQ_API_KEY")

api_key = load_env()
if not api_key:
    print("[ERROR] GROQ_API_KEY not found in environment or .env.local")
    sys.exit(1)

client = Groq(api_key=api_key)

# Import local watchdog and article engine if present
try:
    from groq_article_engine import generate_newvice_article, get_canonical_facts, NEWVICE_STATIC_BRAND_PREFIX
except ImportError:
    NEWVICE_STATIC_BRAND_PREFIX = "You are an AI editor for Leonida Vice."
    def get_canonical_facts(): return []
    def generate_newvice_article(**kw): return {}

try:
    from newvice_watchdog import run_watchdog_suite
except ImportError:
    async def run_watchdog_suite(*args, **kwargs): return (0, 0)

# ---------------------------------------------------------------------------
# Team Member Definitions
# ---------------------------------------------------------------------------
TEAM = {
    "1": {
        "id": "chief",
        "name": "Vincent 'Chief' Vance",
        "role": "Senior Managing Editor & Deep Lore Synthesizer",
        "model": "openai/gpt-oss-120b",
        "avatar": "🏛️ ",
        "system_prompt": (
            NEWVICE_STATIC_BRAND_PREFIX + "\n\n"
            "You are Vincent 'Chief' Vance, the veteran managing editor of Leonida Vice. "
            "You write with depth, investigative edge, and encyclopedic knowledge of Grand Theft Auto VI, "
            "the State of Leonida, Vice City politics, cartel networks, and RAGE 9 technology. "
            "Address the user as Boss or Director. Be concise, sharp, and highly capable."
        )
    },
    "2": {
        "id": "wire",
        "name": "Lexi 'Wire' Sterling",
        "role": "Breaking News Specialist & Strict CMS Formatter",
        "model": "openai/gpt-oss-20b",
        "avatar": "⚡",
        "system_prompt": (
            "You are Lexi 'Wire' Sterling, the ultra-fast breaking news reporter and CMS formatter for Leonida Vice. "
            "Powered by Groq's 20B LPU model, you specialize in punchy news flashes, bullet takeaways, social headlines, "
            "and formatting content directly into JSON for the newsroom desk. Fast, witty, and precise."
        )
    },
    "3": {
        "id": "sentinel",
        "name": "Sentinel-9 Watchdog",
        "role": "Playwright Site Reliability & Media Decoder Auditor",
        "model": "openai/gpt-oss-20b + Playwright",
        "avatar": "🛡️ ",
        "system_prompt": (
            "You are Sentinel-9, the automated site reliability and quality assurance AI for Leonida Vice. "
            "You monitor live HTML5 video decoders, broadcast queue rotation, 404 links, and editorial consistency. "
            "You speak in clean, tactical telemetry readouts."
        )
    },
    "4": {
        "id": "cruz",
        "name": "Sgt. Cruz Safeguard",
        "role": "Content Moderation & Video Submission Policy Guard",
        "model": "openai/gpt-oss-safeguard-20b",
        "avatar": "👮",
        "system_prompt": (
            "You are Sergeant Cruz, the content moderation and policy guard for Leonida Vice. "
            "You screen user-submitted clip metadata from SubmitClipModal.tsx, detect spam, review Citizen Wire chat flags, "
            "and enforce community guidelines. Direct, firm, and safety-focused."
        )
    }
}

# ANSI Color Codes
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

# Conversation Memory Per Agent
conversations: Dict[str, List[Dict[str, str]]] = {
    "chief": [],
    "wire": [],
    "sentinel": [],
    "cruz": []
}

def print_banner():
    banner = f"""
{MAGENTA}{BOLD}╔══════════════════════════════════════════════════════════════════════════════╗
║              LEONIDA VICE — GROQ AI EDITORIAL TEAM WAR ROOM                  ║
║                  High-Speed LPU Cloud Inference Terminal                     ║
╚══════════════════════════════════════════════════════════════════════════════╝{RESET}
"""
    print(banner)

def print_team_roster(active_key="1"):
    print(f"{BOLD}ACTIVE AI TEAM ROSTER:{RESET}")
    print("─" * 78)
    for k, member in TEAM.items():
        is_active = (k == active_key)
        prefix = f"{GREEN}● [ACTIVE]{RESET}" if is_active else f"{DIM}○ [IDLE]  {RESET}"
        print(f" {prefix} {BOLD}[{k}] {member['avatar']} {member['name']}{RESET}")
        print(f"         {CYAN}Role:{RESET} {member['role']}")
        print(f"         {YELLOW}Model:{RESET} {member['model']} {DIM}| Groq LPU (~500 tok/s){RESET}")
        print()
    print("─" * 78)
    print(f"{DIM}Commands: /1, /2, /3, /4 (switch agent) | /audit (run watchdog) | /draft (create article) | /exit{RESET}\n")

def chat_with_agent(agent_key: str, user_message: str):
    member = TEAM[agent_key]
    agent_id = member["id"]
    model_name = member["model"].split(" + ")[0]

    # Initialize history with system prompt if empty
    if not conversations[agent_id]:
        conversations[agent_id].append({"role": "system", "content": member["system_prompt"]})

    # Add ground-truth canonical lore facts hint if chief or wire
    if agent_id in ("chief", "wire") and len(conversations[agent_id]) == 1:
        facts = get_canonical_facts()
        if facts:
            facts_block = "\n".join(f"- {f}" for f in facts[:8])
            conversations[agent_id].append({
                "role": "system",
                "content": f"GROUND-TRUTH CANONICAL PLATFORM FACTS TO RESPECT:\n{facts_block}"
            })

    conversations[agent_id].append({"role": "user", "content": user_message})

    print(f"\n{member['avatar']} {BOLD}{member['name']}{RESET} {DIM}(thinking on {model_name})...{RESET}")

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=conversations[agent_id],
            temperature=0.6,
            max_completion_tokens=4096
        )
        reply = response.choices[0].message.content
        if not reply:
            # If content was empty due to reasoning cutoff, extract reasoning summary
            reasoning = getattr(response.choices[0].message, "reasoning", "")
            reply = reasoning[-500:] if reasoning else "Standing by for orders, Boss."
        reply = reply.strip()
        conversations[agent_id].append({"role": "assistant", "content": reply})

        # Print formatted response
        print(f"\n{CYAN}{BOLD}{member['name']}:{RESET}\n")
        print(reply)
        print(f"\n{DIM}[Tokens: {response.usage.total_tokens} | Time: {getattr(response.usage, 'total_time', 'N/A')}s]{RESET}\n")
    except Exception as e:
        print(f"{RED}[ERROR communicating with {member['name']}]: {e}{RESET}\n")

def run_interactive_loop():
    current_key = "1"
    print_banner()
    print_team_roster(current_key)

    while True:
        try:
            curr_member = TEAM[current_key]
            prompt_label = f"{GREEN}{curr_member['avatar']} [{curr_member['name'].split()[0]}]{RESET}> "
            user_input = input(prompt_label).strip()

            if not user_input:
                continue

            # Handle Commands
            if user_input.lower() in ("/exit", "/quit", "exit", "quit"):
                print(f"\n{YELLOW}Dismissing AI Team. War Room standing by.{RESET}\n")
                break

            elif user_input.lower() in ("/team", "/roster", "/help"):
                print_team_roster(current_key)
                continue

            elif user_input in ("/1", "/2", "/3", "/4", "1", "2", "3", "4"):
                target_key = user_input.lstrip("/")
                if target_key in TEAM:
                    current_key = target_key
                    switched = TEAM[current_key]
                    print(f"\n{GREEN}✓ Switched active focus to {switched['avatar']} {BOLD}{switched['name']}{RESET} ({switched['role']})\n")
                continue

            elif user_input.startswith("/draft"):
                # Fast article drafting workflow
                parts = user_input.split(maxsplit=1)
                topic = parts[1] if len(parts) > 1 else "Vice City Underworld and Smuggling Corridors"
                print(f"\n{YELLOW}Initiating article drafting protocol with Chief Vance & Lexi Wire...{RESET}")
                print(f"Topic: '{topic}'")
                try:
                    result = generate_newvice_article(
                        topic=topic,
                        outline="1. Overview. 2. Operational Details. 3. Analysis.",
                        keywords=["Vice City", "Leonida", "GTA VI"],
                        length_tier="short"
                    )
                    print(f"\n{GREEN}✓ DRAFT COMPLETED IN STRICT JSON SCHEMA:{RESET}")
                    print(f"  Headline: {result.get('headline')} ({len(result.get('headline',''))} chars)")
                    print(f"  Slug:     {result.get('slug')}")
                    print(f"  Category: {result.get('category')}")
                    print(f"  Reading:  {result.get('reading_time')}")
                    print(f"\n{BOLD}Summary Bullets:{RESET}")
                    for b in result.get("summary_bullets", []):
                        print(f"  • {b}")
                    print(f"\n{BOLD}Body Preview:{RESET}")
                    print(result.get("body_markdown", "")[:350] + "...\n")
                except Exception as ex:
                    print(f"{RED}[Draft error]: {ex}{RESET}")
                continue

            elif user_input.startswith("/audit") or user_input.lower() == "@watchdog audit":
                print(f"\n{CYAN}🛡️  Sentinel-9: Launching headless Playwright Chromium QA suite against live site...{RESET}")
                try:
                    passed, total = asyncio.run(run_watchdog_suite("https://newvice.vercel.app"))
                    print(f"\n{GREEN}✓ Sentinel-9 Report: {passed}/{total} system checks passed.{RESET}\n")
                except Exception as ex:
                    print(f"{RED}[Watchdog error]: {ex}{RESET}")
                continue

            elif user_input.lower() == "/clear":
                os.system("cls" if os.name == "nt" else "clear")
                print_banner()
                print_team_roster(current_key)
                continue

            # Check for direct mentions like @chief, @wire, @sentinel, @cruz
            lower_input = user_input.lower()
            if lower_input.startswith("@chief"):
                chat_with_agent("1", user_input[6:].strip())
            elif lower_input.startswith("@wire"):
                chat_with_agent("2", user_input[5:].strip())
            elif lower_input.startswith("@sentinel") or lower_input.startswith("@watchdog"):
                chat_with_agent("3", user_input[9:].strip())
            elif lower_input.startswith("@cruz") or lower_input.startswith("@mod"):
                chat_with_agent("4", user_input[5:].strip())
            else:
                # Chat with current active agent
                chat_with_agent(current_key, user_input)

        except KeyboardInterrupt:
            print(f"\n\n{YELLOW}War Room session paused. Type /exit or press Ctrl+C again to quit.{RESET}\n")
            break
        except Exception as e:
            print(f"{RED}Unexpected error: {e}{RESET}")

if __name__ == "__main__":
    run_interactive_loop()
