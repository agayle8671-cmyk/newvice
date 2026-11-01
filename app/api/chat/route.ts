import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, roomId, userId } = body;

    if (!content || !roomId || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (content.length > 500) {
      return NextResponse.json(
        { error: "Message too long" },
        { status: 400 }
      );
    }

    // Optional: OpenAI moderation check for flagged content
    if (process.env.OPENAI_API_KEY) {
      try {
        const moderationRes = await fetch(
          "https://api.openai.com/v1/moderations",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({ input: content }),
          }
        );

        const moderationData = await moderationRes.json();
        if (moderationData.results?.[0]?.flagged) {
          return NextResponse.json(
            { error: "Message flagged by content moderation" },
            { status: 422 }
          );
        }
      } catch {
        // If moderation API fails, allow the message through
        // (fail open — don't block users because of API issues)
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
