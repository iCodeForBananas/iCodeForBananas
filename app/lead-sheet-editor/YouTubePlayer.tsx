"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Youtube } from "lucide-react";
import type { Playback } from "./PlaybackBar";
import type { YouTubeLink } from "./youtube";

/**
 * A YouTube video standing in for the transport's wall clock: hitting Play
 * plays the recording, and the highlighted line follows the video's playhead
 * rather than a stopwatch, so the sheet stays in sync even after a pause, a
 * scrub, or a slow buffer.
 */

// ─── The bit of the IFrame API we actually use ────────────────────────────────

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data?: number;
}

interface YTNamespace {
  Player: new (
    host: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YTPlayerEvent) => void;
        onStateChange?: (event: YTPlayerEvent) => void;
        onError?: (event: YTPlayerEvent) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_BUFFERING = 3;

/** Long enough for a slow connection, short enough to fall back before a set starts. */
const READY_TIMEOUT_MS = 12_000;

let apiPromise: Promise<YTNamespace> | null = null;

/**
 * The IFrame API is a single global script that calls one global callback when
 * it lands, so every player on the page shares this one load.
 */
function loadIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error("YouTube API arrived without a player"));
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("YouTube API failed to load"));
      document.head.appendChild(script);
    });
    // A failed load shouldn't poison the next attempt (offline, then online).
    apiPromise.catch(() => {
      apiPromise = null;
    });
  }
  return apiPromise;
}

export type YouTubeStatus = "idle" | "loading" | "ready" | "error";

interface Session {
  /** Which player this state describes — `videoId@offset`, or null for no video. */
  key: string | null;
  status: Exclude<YouTubeStatus, "idle">;
  playing: boolean;
  time: number;
  duration: number;
}

const blankSession = (key: string | null): Session => ({
  key,
  status: "loading",
  playing: false,
  time: 0,
  duration: 0,
});

export interface YouTubeTransport {
  playback: Playback;
  status: YouTubeStatus;
  /** Ref callback for the element the player replaces — see `YouTubePanel`. */
  mount: (element: HTMLDivElement | null) => void;
}

/**
 * `fallbackDuration` covers the gap before the video reports its own length,
 * so the scrubber has a sensible span from the first frame.
 */
export function useYouTubePlayback(
  link: YouTubeLink | null,
  fallbackDuration: number
): YouTubeTransport {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [session, setSession] = useState<Session>(() => blankSession(null));
  const playerRef = useRef<YTPlayer | null>(null);
  const timeRef = useRef(0);

  const videoId = link?.videoId ?? null;
  // Song time 0:00 sits here in the video, so every reading is offset by it.
  const startSeconds = link?.startSeconds ?? 0;
  // One player's worth of state. Naming it lets a swapped video read as a fresh
  // load without the effect having to reset four pieces of state on its way in.
  const key = videoId && host ? `${videoId}@${startSeconds}` : null;
  const { status: loadStatus, playing, time, duration } =
    session.key === key ? session : blankSession(key);
  const status: YouTubeStatus = key === null ? "idle" : loadStatus;

  useEffect(() => {
    if (!key || !videoId || !host) return;

    let cancelled = false;
    timeRef.current = 0;
    const patch = (changes: Partial<Omit<Session, "key">>) =>
      setSession((prev) => ({ ...(prev.key === key ? prev : blankSession(key)), ...changes, key }));

    // A video that never becomes ready — blocked script, dead network — would
    // otherwise leave the transport permanently stuck on "Loading".
    const timeout = setTimeout(() => {
      if (!cancelled) patch({ status: "error" });
    }, READY_TIMEOUT_MS);

    // The API swaps the element it's handed for the iframe, so it gets a child
    // of its own to consume — React keeps ownership of the mount point.
    const target = document.createElement("div");
    target.style.width = "100%";
    target.style.height = "100%";
    host.appendChild(target);

    loadIframeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(target, {
          videoId,
          width: "100%",
          height: "100%",
          // The privacy-preserving host still works with the IFrame API.
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            start: Math.floor(startSeconds),
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              clearTimeout(timeout);
              patch({
                status: "ready",
                duration: Math.max(0, event.target.getDuration() - startSeconds),
              });
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const state = event.data;
              const changes: Partial<Omit<Session, "key">> = {
                status: "ready",
                playing: state === STATE_PLAYING || state === STATE_BUFFERING,
              };
              // Length is only known once the video has actually loaded for some
              // uploads, so it's re-read as the state settles.
              const length = event.target.getDuration();
              if (length > 0) changes.duration = Math.max(0, length - startSeconds);
              if (state === STATE_ENDED || state === STATE_PLAYING) {
                const t = Math.max(0, event.target.getCurrentTime() - startSeconds);
                timeRef.current = t;
                changes.time = t;
              }
              patch(changes);
            },
            onError: () => {
              if (cancelled) return;
              clearTimeout(timeout);
              patch({ status: "error" });
            },
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(timeout);
        patch({ status: "error" });
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      try {
        playerRef.current?.destroy();
      } catch {
        // The iframe can already be gone with the unmounted subtree.
      }
      playerRef.current = null;
      target.remove();
    };
  }, [key, videoId, host, startSeconds]);

  // Published ten times a second, matching the wall-clock transport: the sheet
  // re-renders off `time`, and nobody can see sixty renders a second.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastPublished = -1;
    const tick = () => {
      const player = playerRef.current;
      if (player) {
        const t = Math.max(0, player.getCurrentTime() - startSeconds);
        timeRef.current = t;
        const decisecond = Math.floor(t * 10);
        if (decisecond !== lastPublished) {
          lastPublished = decisecond;
          setSession((prev) => ({ ...prev, time: t }));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, startSeconds]);

  const seek = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds);
      timeRef.current = clamped;
      setSession((prev) => ({ ...prev, time: clamped }));
      playerRef.current?.seekTo(clamped + startSeconds, true);
    },
    [duration, startSeconds]
  );

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      player.pauseVideo();
      return;
    }
    // Hitting play at the end starts the song over rather than sitting still.
    if (duration > 0 && timeRef.current >= duration - 0.25) seek(0);
    player.playVideo();
  }, [playing, duration, seek]);

  const restart = useCallback(() => seek(0), [seek]);
  const nudge = useCallback((seconds: number) => seek(timeRef.current + seconds), [seek]);
  const stop = useCallback(() => playerRef.current?.pauseVideo(), []);

  return {
    status,
    mount: setHost,
    playback: {
      time,
      playing,
      duration: duration || fallbackDuration,
      ready: status === "ready",
      toggle,
      seek,
      nudge,
      restart,
      stop,
    },
  };
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * Sits above the transport bar while playback is open. The video can be rolled
 * up out of the way, but it is never unmounted — the audio is the whole point,
 * and a destroyed iframe stops playing.
 */
export function YouTubePanel({
  link,
  status,
  mount,
}: {
  link: YouTubeLink;
  status: YouTubeStatus;
  mount: (element: HTMLDivElement | null) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="fixed bottom-32 left-4 z-[61] w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900 print:hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Youtube className="h-4 w-4 shrink-0 text-red-600" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-neutral-200">
          {status === "error"
            ? "Video unavailable"
            : status === "ready"
              ? "Playing with video"
              : "Loading video…"}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Hide video" : "Show video"}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors duration-150 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {/* Clipped rather than hidden: `display: none` would stop the audio. */}
      <div className={`overflow-hidden ${open ? "h-36" : "h-0"}`}>
        <div ref={mount} className="h-36 w-full" />
      </div>

      {status === "error" && (
        <p className="px-3 py-2 text-[0.7rem] leading-snug text-gray-500 dark:text-neutral-400">
          This one can&apos;t be embedded — playback fell back to the stopwatch.{" "}
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-gray-700 dark:hover:text-neutral-200"
          >
            Open on YouTube
          </a>
        </p>
      )}

      {status === "ready" && link.startSeconds > 0 && (
        <p className="px-3 pb-2 text-[0.7rem] text-gray-400 dark:text-neutral-500">
          Song starts {link.startSeconds}s into the video
        </p>
      )}
    </div>
  );
}
