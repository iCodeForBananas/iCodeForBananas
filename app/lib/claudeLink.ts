// Opening a new Claude chat with a message already typed in, via
// claude.ai/new?q=. Pure.

export const CLAUDE_NEW_CHAT = "https://claude.ai/new";

/**
 * Longest encoded ?q= prefill sent to claude.ai/new. Long URLs get refused
 * along the way, so a message bigger than this goes by clipboard instead.
 */
export const CLAUDE_PREFILL_MAX = 8000;

/** True when `text` fits in the ?q= prefill. */
export function fitsClaudePrefill(text: string): boolean {
  return encodeURIComponent(text).length <= CLAUDE_PREFILL_MAX;
}

/** A new chat with `text` typed in, or null when it's too long to carry in the URL. */
export function claudePrefillUrl(text: string): string | null {
  return fitsClaudePrefill(text) ? `${CLAUDE_NEW_CHAT}?q=${encodeURIComponent(text)}` : null;
}
