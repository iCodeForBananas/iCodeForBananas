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
  const { session, completedBlock, action } = await req.json();
  // action: "complete" | "skip"
  // completedBlock: the block that was just acted on
  // session: full current session state

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const remainingBlocks = session.blocks.filter((b: { completed: boolean; skipped: boolean }) => !b.completed && !b.skipped);
  if (remainingBlocks.length === 0) return NextResponse.json({ modified: false });

  const doneBlocks = session.blocks.filter((b: { completed: boolean }) => b.completed);
  const skippedBlocks = session.blocks.filter((b: { skipped: boolean }) => b.skipped);

  const prompt = `You are an autonomous guitar practice coach agent monitoring a live session.

Session goal: "${session.goal}"
Skill level: ${session.skillLevel}
Total session time: ${session.totalMinutes} minutes

What just happened: The student ${action === "skip" ? "SKIPPED" : "COMPLETED"} the block "${completedBlock.title}" (${completedBlock.durationMinutes} min).
${action === "complete" && completedBlock.durationMinutes >= 5 ? `They completed it in the allotted time.` : ""}
${action === "skip" ? `This is a skip — they avoided this topic.` : ""}

Completed so far: ${doneBlocks.map((b: { title: string }) => b.title).join(", ") || "none"}
Skipped so far: ${skippedBlocks.map((b: { title: string }) => b.title).join(", ") || "none"}

Remaining blocks (in order):
${remainingBlocks.map((b: { title: string; durationMinutes: number }, i: number) => `${i + 1}. "${b.title}" (${b.durationMinutes} min)`).join("\n")}

Available tools to link: ${Object.keys(TOOL_LINKS).join(", ")}

Decide: should the remaining blocks be modified based on what just happened?

Rules:
- If they skipped, consider adding a shorter, easier version of that topic later
- If they completed quickly and it seemed easy, consider increasing difficulty of upcoming blocks
- If the session is going well, you may keep blocks unchanged
- Total remaining time must stay the same (${remainingBlocks.reduce((a: number, b: { durationMinutes: number }) => a + b.durationMinutes, 0)} minutes)
- Only modify if there's a genuine reason — don't change for the sake of it

Return ONLY valid JSON:
{
  "modified": true | false,
  "agentMessage": "string — one sentence explaining what you changed and why, written directly to the student",
  "remainingBlocks": [
    {
      "id": "string (keep original id if unchanged, new id if new block)",
      "title": "string",
      "description": "string",
      "durationMinutes": number,
      "toolLink": { "label": "Tool Name", "href": "/slug" } | null,
      "completed": false,
      "skipped": false
    }
  ]
}

If modified is false, omit remainingBlocks and agentMessage.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
  });

  const text = response.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return NextResponse.json({ modified: false });

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.modified) return NextResponse.json({ modified: false });

  // Resolve tool hrefs
  const remainingBlocksResolved = parsed.remainingBlocks.map((b: { toolLink?: { label: string } | null; [key: string]: unknown }) => ({
    ...b,
    toolLink: b.toolLink
      ? { label: b.toolLink.label, href: TOOL_LINKS[b.toolLink.label] ?? "/" }
      : undefined,
  }));

  return NextResponse.json({
    modified: true,
    agentMessage: parsed.agentMessage,
    remainingBlocks: remainingBlocksResolved,
  });
}
