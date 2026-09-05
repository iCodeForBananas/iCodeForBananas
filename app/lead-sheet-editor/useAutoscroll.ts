"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advance, atEnd, loadSpeed, nudgeSpeed, saveSpeed, split } from "./autoscroll";

/**
 * Drives a scroll container by a fraction of a pixel per frame.
 *
 * The float position lives in a ref rather than in state: it changes sixty
 * times a second and nothing renders from it, so putting it in state would
 * re-render the whole song for every frame.
 *
 * The whole pixels go to scrollTop and the fraction to a transform on the
 * content, because scrollTop cannot hold a fraction. See autoscroll.ts.
 */
export function useAutoscroll(
  container: React.RefObject<HTMLElement | null>,
  content: React.RefObject<HTMLElement | null>,
  songId: string
) {
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(() => loadSpeed(songId));
  const position = useRef(0);
  const speedRef = useRef(speed);
  const selfScrolling = useRef(false);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const setSpeed = useCallback(
    (next: number | ((current: number) => number)) => {
      setSpeedState((current) => {
        const value = typeof next === "function" ? next(current) : next;
        saveSpeed(songId, value);
        return value;
      });
    },
    [songId]
  );

  const faster = useCallback(() => setSpeed((s) => nudgeSpeed(s, 1)), [setSpeed]);
  const slower = useCallback(() => setSpeed((s) => nudgeSpeed(s, -1)), [setSpeed]);
  const toggle = useCallback(() => setRunning((on) => !on), []);

  // Scrolling by hand takes over. Without this the next frame would yank the
  // page back to wherever the loop had got to, which feels like a fight.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const onScroll = () => {
      if (selfScrolling.current) return;
      position.current = element.scrollTop;
      if (content.current) content.current.style.transform = "";
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [container, content]);

  useEffect(() => {
    const element = container.current;
    const inner = content.current;
    if (!running || !element || !inner) return;

    position.current = element.scrollTop;
    let frame = 0;
    let last: number | null = null;

    const tick = (now: number) => {
      const elapsed = last === null ? 0 : now - last;
      last = now;

      const max = element.scrollHeight - element.clientHeight;
      position.current = advance(position.current, speedRef.current, elapsed, max);
      const { whole, fraction } = split(position.current);

      selfScrolling.current = true;
      element.scrollTop = whole;
      selfScrolling.current = false;
      inner.style.transform = fraction === 0 ? "" : `translateY(${-fraction}px)`;

      if (atEnd(position.current, max)) {
        setRunning(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      // Leave the content where the eye last saw it rather than snapping.
      inner.style.transform = "";
      element.scrollTop = Math.round(position.current);
    };
  }, [running, container, content]);

  return { running, speed, toggle, faster, slower, setSpeed };
}
