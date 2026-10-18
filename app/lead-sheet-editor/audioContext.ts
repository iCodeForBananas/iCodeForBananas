/**
 * The one AudioContext the kit plays through, made so it will sound on a phone.
 *
 * iOS Safari keeps a context suspended unless it is created or resumed while a
 * tap is being handled, and the kit starts from effects, a render or several
 * removed from the tap that asked for it (the arranger's drums start when the
 * playhead reaches their clip). So rather than make a context when the music
 * starts, this makes one on the first touch, click or key anywhere on the page,
 * and resumes it on every one after — which also brings it back after iOS
 * interrupts it for a call. By the time anything plays it is already running.
 *
 * It also tells iOS the page is playing audio rather than making UI sounds, so
 * the ring/silent switch doesn't quietly mute the loop.
 *
 * Shared, so nothing that uses it closes it: disconnect your own nodes instead.
 */

let shared: AudioContext | null = null;

export function sharedAudioContext(): AudioContext {
  if (!shared || shared.state === "closed") {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = "playback";
      } catch {
        // Older WebKit has the object but not this type; nothing to be done.
      }
    }
    shared = new AudioContext();
  }
  if (shared.state !== "running") shared.resume().catch(() => {});
  return shared;
}

if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "touchend", "click", "keydown"]) {
    window.addEventListener(type, () => void sharedAudioContext(), { capture: true, passive: true });
  }
}
