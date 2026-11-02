#!/usr/bin/env python3
"""
Leonida Vice — Multi-Model Groq Article Generation Engine
Based on Groq AI Team Setup Guide for NewVice Platform.

Features:
- Static brand prefix for 50% Groq Prompt Caching discount.
- Strict Mode (strict: true) JSON Schema outputs conforming to AdminNewsroomView.tsx.
- Multi-model routing: openai/gpt-oss-120b (long-form) and openai/gpt-oss-20b (short-form).
- Local canonical facts / lore retrieval from canonical_facts.json (<500 tokens).
- Deterministic post-processing (headline length, keyword inclusion, slug validation).
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import List, Literal, Optional, Dict, Any
from groq import Groq

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# 0. Environment Setup & Credential Ingestion
# ---------------------------------------------------------------------------
def load_env_credentials():
    """Load GROQ_API_KEY from .env.local or .env if not already set."""
    if os.environ.get("GROQ_API_KEY"):
        return os.environ.get("GROQ_API_KEY")
    
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    
    for env_name in [".env.local", ".env"]:
        env_path = repo_root / env_name
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("GROQ_API_KEY=") and not line.startswith("#"):
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        os.environ["GROQ_API_KEY"] = key
                        return key
    return None

api_key = load_env_credentials()
if not api_key:
    print("[ERROR] GROQ_API_KEY not found in environment or .env.local", file=sys.stderr)
    sys.exit(1)

client = Groq(api_key=api_key)

# ---------------------------------------------------------------------------
# 1. Static Brand Prefix (Optimized for Groq 50% Automatic Prompt Caching)
# ---------------------------------------------------------------------------
NEWVICE_STATIC_BRAND_PREFIX = """You are the Senior Managing Editor for NewVice Media (Leonida Vice), a premier digital investigative publication and interactive live broadcast magazine covering Grand Theft Auto VI, Leonida culture, Vice City entertainment, Mount Kalaga expeditions, and Leonida Keys lifestyle.

EDITORIAL STYLE & SEO MANDATES:
1. Voice: Sharp, immersive, culturally savvy, investigative, and authoritative without generic filler clichés or corporate jargon.
2. Structure: Use compelling H2/H3 subheadings, punchy lead paragraphs, and data-rich prose.
3. SEO Compliance: Headlines must be strictly 60 characters or fewer. Meta descriptions must be between 120 and 155 characters. Naturally weave all target keywords into the first 150 words and subheadings.
4. Ground-Truth Canonical Entities: Maintain strict spelling consistency for recurring platform locations and figures (e.g., Leonida Keys, Mount Kalaga National Park, Vice Dale County, Jason Duval, Lucia Caminos, Raul Bautista, RAGE 9).
5. Output Format: Respond strictly in the requested JSON schema."""

# ---------------------------------------------------------------------------
# 2. Strict JSON Schema Definition for AdminNewsroomView.tsx Ingestion
# ---------------------------------------------------------------------------
ARTICLE_JSON_SCHEMA = {
    "name": "newvice_article_payload",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "headline": {
                "type": "string",
                "description": "SEO-optimized H1 headline, strictly <= 60 characters."
            },
            "slug": {
                "type": "string",
                "description": "URL-safe kebab-case slug derived from the headline."
            },
            "meta_description": {
                "type": "string",
                "description": "OpenGraph / SEO meta description, 120-155 characters."
            },
            "category": {
                "type": "string",
                "enum": [
                    "Leonida Keys",
                    "Drive-In Spotlight",
                    "Mount Kalaga",
                    "Breaking News",
                    "Culture",
                    "Trailers & Media",
                    "Trailers and Media",
                    "Characters",
                    "Leaks & Rumors",
                    "Leaks and Rumors",
                    "Story",
                    "Tech & Rage",
                    "Tech and Rage"
                ]
            },
            "summary_bullets": {
                "type": "array",
                "items": {"type": "string"},
                "description": "3 concise executive takeaway bullets for quick readers."
            },
            "body_markdown": {
                "type": "string",
                "description": "Full article body formatted in clean Markdown with H2 and H3 headers."
            },
            "primary_keywords_used": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": [
            "headline",
            "slug",
            "meta_description",
            "category",
            "summary_bullets",
            "body_markdown",
            "primary_keywords_used"
        ],
        "additionalProperties": False
    }
}

# ---------------------------------------------------------------------------
# 3. Local Ground-Truth Fact Retrieval (Zero-Cost Vector DB Alternative)
# ---------------------------------------------------------------------------
def get_canonical_facts() -> List[str]:
    """Retrieve canonical lore facts from local JSON index."""
    script_dir = Path(__file__).resolve().parent
    facts_file = script_dir / "canonical_facts.json"
    facts = []
    if facts_file.exists():
        try:
            with open(facts_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                for category, items in data.items():
                    if isinstance(items, list):
                        facts.extend(items)
        except Exception as e:
            print(f"[WARN] Could not parse canonical_facts.json: {e}", file=sys.stderr)
    return facts

# ---------------------------------------------------------------------------
# 4. Multi-Model Article Routing Engine
# ---------------------------------------------------------------------------
def generate_newvice_article(
    topic: str,
    outline: str,
    keywords: List[str],
    length_tier: Literal["long", "short"] = "long",
    ground_truth_facts: Optional[List[str]] = None,
    preferred_category: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate an article using Groq's high-speed LPU infrastructure with Strict JSON.
    - Long-form (1,400–2,000 words): Routes to openai/gpt-oss-120b.
    - Short-form (350–500 words): Routes to openai/gpt-oss-20b.
    """
    if ground_truth_facts is None:
        ground_truth_facts = get_canonical_facts()

    if length_tier == "long":
        selected_model = "openai/gpt-oss-120b"
        word_target = "1,400 to 2,000 words"
        max_tokens = 12288
    else:
        selected_model = "openai/gpt-oss-20b"
        word_target = "350 to 500 words"
        max_tokens = 6144

    facts_block = "\n".join(f"- {fact}" for fact in ground_truth_facts[:10])
    category_hint = f"\nPREFERRED CATEGORY: {preferred_category}" if preferred_category else ""

    user_prompt = (
        f"TASK: Draft a {length_tier}-form SEO article ({word_target}).\n"
        f"TOPIC: {topic}\n"
        f"TARGET KEYWORDS: {', '.join(keywords)}\n"
        f"CANONICAL FACTS TO RESPECT:\n{facts_block}{category_hint}\n\n"
        f"OUTLINE:\n{outline}"
    )

    try:
        response = client.chat.completions.create(
            model=selected_model,
            messages=[
                {"role": "system", "content": NEWVICE_STATIC_BRAND_PREFIX},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_completion_tokens=max_tokens,
            response_format={
                "type": "json_schema",
                "json_schema": ARTICLE_JSON_SCHEMA
            }
        )
    except Exception as exc:
        # Graceful fallback: if 120B hits rate or availability limits, retry with 20B
        if selected_model == "openai/gpt-oss-120b":
            print(f"[WARN] 120B call failed ({exc}); falling back to openai/gpt-oss-20b...", file=sys.stderr)
            selected_model = "openai/gpt-oss-20b"
            response = client.chat.completions.create(
                model=selected_model,
                messages=[
                    {"role": "system", "content": NEWVICE_STATIC_BRAND_PREFIX},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_completion_tokens=8192,
                response_format={
                    "type": "json_schema",
                    "json_schema": ARTICLE_JSON_SCHEMA
                }
            )
        else:
            raise exc

    content = response.choices[0].message.content
    article_data = json.loads(content)

    # -----------------------------------------------------------------------
    # 5. Deterministic Post-Processing & Quality Assertions
    # -----------------------------------------------------------------------
    # Assert headline length <= 60 characters
    headline = article_data.get("headline", "").strip()
    if len(headline) > 60:
        # Trim to last whitespace within 57 chars + ellipsis
        trimmed = headline[:57].rsplit(" ", 1)[0]
        article_data["headline"] = trimmed

    # Ensure slug is lowercased and clean
    slug = article_data.get("slug", "").strip().lower()
    clean_slug = "".join(c if c.isalnum() or c == "-" else "" for c in slug.replace(" ", "-"))
    article_data["slug"] = clean_slug

    # Normalize category
    cat = article_data.get("category", "")
    article_data["category"] = cat.replace(" and ", " & ")

    # Compute reading time (assumes 225 words/min)
    body = article_data.get("body_markdown", "")
    word_count = len(body.split())
    read_mins = max(1, round(word_count / 225))
    article_data["reading_time"] = f"{read_mins} min. read"
    article_data["word_count"] = word_count
    article_data["model_used"] = selected_model

    # Check keyword coverage
    keywords_lower = [k.lower() for k in keywords]
    body_lower = body.lower()
    covered = [k for k in keywords_lower if k in body_lower]
    article_data["keyword_coverage_percent"] = round((len(covered) / max(1, len(keywords))) * 100, 1)

    return article_data


# ---------------------------------------------------------------------------
# 6. CLI Execution Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Leonida Vice Multi-Model Groq Article Generator")
    parser.add_argument("--topic", type=str, default="RAGE 9 Physics Engine Dynamic Weather in Vice City", help="Article topic")
    parser.add_argument("--outline", type=str, default="1. Introduction to RAGE 9. 2. Ocean wave displacement. 3. Volumetric storms in Vice Beach.", help="Outline")
    parser.add_argument("--keywords", type=str, default="RAGE 9, Vice City, weather simulation, ocean physics", help="Comma-separated keywords")
    parser.add_argument("--tier", type=str, choices=["long", "short"], default="short", help="Length tier (long or short)")
    parser.add_argument("--category", type=str, default="Tech & Rage", help="Category")
    parser.add_argument("--output", type=str, default=None, help="Save result to JSON file path")
    args = parser.parse_args()

    kw_list = [k.strip() for k in args.keywords.split(",") if k.strip()]
    print(f"Generating {args.tier}-form article on topic: '{args.topic}'...")
    
    result = generate_newvice_article(
        topic=args.topic,
        outline=args.outline,
        keywords=kw_list,
        length_tier=args.tier,
        preferred_category=args.category
    )

    print("\n" + "="*70)
    print(f"HEADLINE: {result['headline']} ({len(result['headline'])} chars)")
    print(f"SLUG:     {result['slug']}")
    print(f"CATEGORY: {result['category']}")
    print(f"EST TIME: {result['reading_time']} ({result['word_count']} words)")
    print(f"MODEL:    {result['model_used']}")
    print(f"KEYWORD COVERAGE: {result['keyword_coverage_percent']}%")
    print("="*70)
    print("\nSUMMARY BULLETS:")
    for b in result["summary_bullets"]:
        print(f" * {b}")
    print("\nBODY EXCERPT (First 350 chars):")
    print(result["body_markdown"][:350] + "...\n")

    if args.output:
        out_path = Path(args.output)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        print(f"Saved complete payload to {out_path}")
