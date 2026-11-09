import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CARDS, CARD_BY_ID } from "../../../lib/wordClimbContent";
import { type CardState, type CardStates, parseCardState } from "../../../lib/wordClimbSchedule";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}

const PLAYER_PATTERN = /^[a-z][a-z0-9 '-]{0,39}$/;

interface CardRow {
  card_id: string;
  reps: number;
  ease: number;
  interval_days: number;
  due_on: string | null;
  secure: boolean;
  lapses: number;
  reviews: number;
  last_grade: string | null;
  updated_at: string;
}

function rowToState(row: CardRow): CardState | null {
  return parseCardState({
    reps: row.reps,
    ease: row.ease,
    intervalDays: row.interval_days,
    dueOn: row.due_on,
    secure: row.secure,
    lapses: row.lapses,
    reviews: row.reviews,
    lastGrade: row.last_grade,
    updatedAt: Date.parse(row.updated_at),
  });
}

function failure(e: unknown, fallback: string) {
  const message = e instanceof Error ? e.message : ((e as { message?: string } | null)?.message ?? fallback);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

// ── GET: every card this child has seen ──────────────────────────────────────
export async function GET(req: NextRequest) {
  const player = req.nextUrl.searchParams.get("player") ?? "";
  if (!PLAYER_PATTERN.test(player)) {
    return NextResponse.json({ success: false, error: "Invalid player" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase()
      .from("word_climb_cards")
      .select("card_id, reps, ease, interval_days, due_on, secure, lapses, reviews, last_grade, updated_at")
      .eq("player_name", player)
      .limit(CARDS.length * 2);
    if (error) throw error;

    const cards: CardStates = {};
    for (const row of (data ?? []) as CardRow[]) {
      const state = rowToState(row);
      if (state) cards[row.card_id] = state;
    }
    return NextResponse.json({ success: true, cards });
  } catch (e) {
    return failure(e, "Failed to load");
  }
}

// ── POST: save one or more cards ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { player_name?: unknown; cards?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const player = body.player_name;
  const entries = body.cards && typeof body.cards === "object" ? Object.entries(body.cards) : [];
  if (typeof player !== "string" || !PLAYER_PATTERN.test(player) || entries.length === 0 || entries.length > CARDS.length) {
    return NextResponse.json({ success: false, error: "Invalid player or cards" }, { status: 400 });
  }

  const rows = [];
  for (const [cardId, value] of entries) {
    const state = parseCardState(value);
    if (!state || !CARD_BY_ID.has(cardId)) {
      return NextResponse.json({ success: false, error: `Invalid card: ${cardId}` }, { status: 400 });
    }
    rows.push({
      player_name: player,
      card_id: cardId,
      reps: state.reps,
      ease: state.ease,
      interval_days: state.intervalDays,
      due_on: state.dueOn,
      secure: state.secure,
      lapses: state.lapses,
      reviews: state.reviews,
      last_grade: state.lastGrade,
      updated_at: new Date(state.updatedAt).toISOString(),
    });
  }

  try {
    const { error } = await supabase().from("word_climb_cards").upsert(rows, { onConflict: "player_name,card_id" });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return failure(e, "Failed to save");
  }
}
