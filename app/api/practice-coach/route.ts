import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";

const TOOL_LINKS: Record<string, string> = {
  "Fretboard Explorer": "/fretboard",
  "Fretboard Quiz": "/fretboard-quiz",
  "Chord Progressions": "/chord-progressions",
  "Chord Finder": "/chord-finder",
  "Chord Shapes": "/chord-shapes",
  "Chord Practice": "/chord-practice",
  "Harmonic Flow": "/harmonic-flow",
  "Circle of Fifths": "/circle-of-fifths",
  "Silent Metronome": "/silent-metronome",
  "Songwriter": "/songwriter",
};

export async function POST(req: NextRequest) {
  const { goal, totalMinutes, skillLevel, history } = await req.json();

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const historyContext = history?.length
    ? `Recent session history (last 5): ${history
        .slice(0, 5)
        .map((s: { goal: string; blocks: { title: string; skipped: boolean }[] }) =>
          `Goal: "${s.goal}", skipped blocks: ${s.blocks.filter((b) => b.skipped).map((b) => b.title).join(", ") || "none"}`
        )
        .join(" | ")}`
    : "No previous sessions.";

  const prompt = `You are an expert guitar practice coach. Generate a structured practice session.

Goal: "${goal}"
Total time: ${totalMinutes} minutes
Skill level: ${skillLevel}
${historyContext}

Available tools to link: ${Object.keys(TOOL_LINKS).join(", ")}

Return ONLY valid JSON in this exact shape:
{
  "blocks": [
    {
      "title": "string",
      "description": "string (2-3 sentences of specific instruction)",
      "durationMinutes": number,
      "toolLink": { "label": "Tool Name", "href": "/slug" } | null
    }
  ],
  "summary": "string (1-2 sentences on what this session focuses on and why)"
}

Rules:
- Block durations must sum to exactly ${totalMinutes} minutes
- 3-6 blocks total
- Only use toolLink if one of the listed tools genuinely fits the block
- Be specific: name keys, scales, techniques, BPM ranges
- If history shows skipped blocks, address those weak spots`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
  });

  const text = response.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });

  const parsed = JSON.parse(jsonMatch[0]);

  // Resolve tool hrefs from our map
  const blocks = parsed.blocks.map((b: { title: string; description: string; durationMinutes: number; toolLink?: { label: string } | null }, i: number) => ({
    id: `block-${i}`,
    ...b,
    toolLink: b.toolLink
      ? { label: b.toolLink.label, href: TOOL_LINKS[b.toolLink.label] ?? "/" }
      : undefined,
    completed: false,
    skipped: false,
  }));

  return NextResponse.json({ blocks, summary: parsed.summary });
}
