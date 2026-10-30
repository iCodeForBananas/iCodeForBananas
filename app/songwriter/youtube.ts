import type { LeadSheet } from "./shared";

// ─── YouTube links ────────────────────────────────────────────────────────────
//
// Paste a YouTube link anywhere in a song — the notes at the top, a section, a
// performance note — and playback runs off the recording instead of a wall
// clock, so the highlighted line follows what you're actually hearing.
//
// A `t=` on the link says where song time 0:00 sits in the video, which is how
// a video with talking or an intro before the count-in still lines up with
// markers tapped from the top of the song:
//
//   https://youtu.be/dQw4w9WgXcQ?t=15   ← the song starts 15s in

/** Any http(s) URL sitting in a line of text, minus trailing punctuation. */
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

export interface YouTubeLink {
  url: string;
  videoId: string;
  /** Position in the video, in seconds, that lines up with song time 0:00. */
  startSeconds: number;
}

export function parseYouTubeUrl(raw: string): YouTubeLink | null {
  // Markdown and prose put punctuation right up against a URL; none of it is
  // part of the link.
  const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(?:www|m|music)\./i, "").toLowerCase();
  let videoId = "";
  if (host === "youtu.be") {
    videoId = url.pathname.slice(1);
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    videoId =
      url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/)?.[1] ?? "";
  }
  if (!/^[\w-]{11}$/.test(videoId)) return null;

  return { url: trimmed, videoId, startSeconds: parseStart(url) };
}

/** `t=90`, `t=90s`, `t=1m30s` and the older `start=90` all mean the same thing. */
function parseStart(url: URL): number {
  const raw =
    url.searchParams.get("t") ??
    url.searchParams.get("start") ??
    url.hash.match(/[?&#]t=([^&]+)/)?.[1] ??
    "";
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const parts = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!parts || (!parts[1] && !parts[2] && !parts[3])) return 0;
  return Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0);
}

/** The first YouTube link in a block of song text, or null if there isn't one. */
export function findYouTubeLinkInText(text: string): YouTubeLink | null {
  for (const match of text.match(URL_RE) ?? []) {
    const link = parseYouTubeUrl(match);
    if (link) return link;
  }
  return null;
}

/** The first YouTube link anywhere in the song, or null if there isn't one. */
export function findYouTubeLink(sheet: LeadSheet | null | undefined): YouTubeLink | null {
  if (!sheet) return null;
  return findYouTubeLinkInText(
    [
      sheet.general_notes ?? "",
      ...(sheet.sections ?? []).flatMap((section) => [section.content ?? "", section.notes ?? ""]),
    ].join("\n")
  );
}
