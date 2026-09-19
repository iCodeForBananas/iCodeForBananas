"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button, Dialog, Flex, IconButton } from "@radix-ui/themes";
import { DRUM_PATTERNS } from "./DrumMachine";
import { ACCENT_GROUPS } from "./accents";

// ─── Reference content ────────────────────────────────────────────────────────
//
// Everything the editor understands, in the order you'd meet it writing a song
// from the top down. Each example is real sheet text, so the copy button is the
// whole point of the modal — read it, copy it, paste it into the song.

interface Entry {
  title: string;
  blurb: string;
  example: string;
  notes?: string[];
}

const ENTRIES: Entry[] = [
  {
    title: "Title, key and tempo",
    blurb:
      "The first line is the song title. Key and Tempo go on the line under it — they feed the transpose tool and the metronome.",
    example: "Song Title\nKey: G  Tempo: 120",
  },
  {
    title: "Performance notes",
    blurb:
      "Anything above the first section header is a note about the whole song — capo, feel, strumming. Inside a section, a line starting with > is a note on that section.",
    example:
      "Capo 2, gentle fingerpicking throughout\n\n[Verse 1]\n[G]Driving down an [D]empty road\n> Build into the chorus here",
  },
  {
    title: "Sections",
    blurb:
      "A line that is nothing but [Something] starts a new section. Intro, Verse, Pre-Chorus, Chorus, Bridge and Outro are recognised by name; anything else still works.",
    example: "[Verse 1]\n[Chorus]\n[Bridge]",
  },
  {
    title: "Chords",
    blurb:
      "Put a chord in square brackets right before the syllable it lands on. Chords render above the lyric and are hoverable in preview.",
    example: "[G]Driving down an [D]empty road, [Em]windows down and [C]radio on",
    notes: ["Replace Chord in the toolbar renames every instance of a chord at once."],
  },
  {
    title: "Time stamps",
    blurb:
      "Start a line with @m:ss to say when it comes in. Hit Play and the sheet highlights each line in time. A stamp claims every line under it until the next stamp, so stamping just the first line of a section lights up that whole section.",
    example:
      "@0:12 [G]Driving down an [D]empty road\n@0:18-0:24 [Em]windows down\n@1:05.5 half-second precision works too",
    notes: [
      "@0:18-0:24 sets an explicit end, leaving a gap after the line instead of running into the next one.",
      "Lines above the first stamp are a pre-roll and never light up.",
      "Tap Timing stamps the whole song by ear; Clear Times wipes every stamp.",
      "Arrange opens the whole song as tracks — drag a line to move its stamp instead of typing one.",
    ],
  },
  {
    title: "Sound tags",
    blurb:
      "A tag in square brackets on a time-stamped line switches a sound on or off during playback. [drum] starts the drum machine, [/drum] stops it, and the same works for claps, shimmer and drone. Use as many as you like — the kit drops out and comes back in wherever you mark it.",
    example:
      "[Intro]\n@0:00 [drum]\n@0:08 [G]Driving down an [D]empty road\n\n[Chorus]\n@0:44 [claps, shimmer]\n\n[Bridge]\n@1:30 [/all]\n@1:30 [Em]just voice and guitar here\n@1:52 [drum, fade-in]\n@1:52 [C]and the band comes back in",
    notes: [
      "Tags stack in one bracket, comma separated — [drum, claps] starts both at once.",
      "[/all] cuts everything that is currently playing.",
      "Add fade-in or fade-out to ride the volume over four seconds instead of snapping — [drum, fade-out] fades the drums away.",
      "A tag only fires on a line that starts with a time stamp — without one there is no moment for it to happen at.",
      "You can hang a tag off a lyric line instead of giving it its own line — @1:30 [/drum] [Em]just voice works the same.",
      "[drone] holds a chord underneath — the Key: from the header unless the Kit Designer names another one, and G on a song with neither.",
      "Chords are safe: only the known sound names count as tags, so [G] and [Am7/C] stay chords.",
      "Tags are stripped out of the previewed and printed sheet, so a tag on its own line reads as blank on the page.",
      "Only playback moves the sounds. Open a sheet without pressing Play and the toggles stay under your own control.",
      "Arrange in the toolbar draws these tags as clips you can slide and stretch, and writes them back for you.",
    ],
  },
  {
    title: "Drum kit settings",
    blurb:
      "A Drums: line in the header picks the pattern and kit for this song. Changing the drum controls in preview writes this line for you, so hand-editing is for when you already know what you want.",
    example: "Drums: Folk Stomp, folk kick, brush snare, Tambourine, 80%",
    notes: [
      "Kick is folk or 808, snare is regular or brush, and the percentage is volume.",
      "An accent name — Tambourine, Egg Shaker, Sleigh Bells — says what the shimmer layer plays. Leave it out and it stays the airy sparkle it has always been.",
      "Leave the line off entirely and the song uses the default kit.",
    ],
  },
  {
    title: "YouTube backing track",
    blurb:
      "Paste a YouTube link anywhere in the song and Play rides the recording instead of a stopwatch, so the highlight follows what you're actually hearing.",
    example: "https://youtu.be/dQw4w9WgXcQ?t=15",
    notes: [
      "?t=15 says the song's 0:00 sits 15 seconds into the video — use it when there's talking or an intro before the count-in.",
    ],
  },
];

const TAG_REFERENCE: { tag: string; does: string }[] = [
  { tag: "[drum]", does: "Start the drum machine" },
  { tag: "[claps]", does: "Start handclaps on 2 and 4" },
  { tag: "[shimmer]", does: "Start the accent percussion — whichever one the Drums: line picked" },
  { tag: "[drone]", does: "Hold a chord underneath as a sustained pad" },
  { tag: "[/drum]", does: "Stop the drums — same for [/claps], [/shimmer] and [/drone]" },
  { tag: "[/all]", does: "Stop everything that is playing" },
  { tag: "fade-in", does: "Modifier: fade the sound up over four seconds" },
  { tag: "fade-out", does: "Modifier: fade the sound away over four seconds" },
  { tag: "@m:ss", does: "When the line comes in — tags need one to fire" },
  { tag: "> note", does: "A performance note on the section" },
  { tag: "[Chorus]", does: "A line that is only a name starts a section" },
  { tag: "[G]", does: "A chord, right before the syllable it lands on" },
  { tag: "Arrange", does: "The toolbar button that lays all of this out on draggable tracks" },
];

// ─── Modal ────────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="1"
      variant="surface"
      color={copied ? "green" : "gray"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      aria-label="Copy example"
      title="Copy example"
      className="shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function SyntaxHelp({ onClose }: { onClose: () => void }) {
  // Escape, the overlay and focus are Radix Dialog's.
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content maxWidth="42rem" className="flex max-h-[90vh] flex-col overflow-hidden p-0">
        {/* Header */}
        <Flex align="center" justify="between" gap="3" className="border-b border-line-subtle px-4 py-3">
          <div>
            <Dialog.Title size="3" mb="0">
              Song syntax
            </Dialog.Title>
            <Dialog.Description size="1" color="gray">
              Everything you can type into a sheet, and what it does when you hit Play.
            </Dialog.Description>
          </div>
          <IconButton variant="ghost" color="gray" onClick={onClose} aria-label="Close syntax help">
            <X className="h-4 w-4" />
          </IconButton>
        </Flex>

        {/* Entries */}
        <div className="flex-1 space-y-5 overflow-auto px-4 py-4">
          {ENTRIES.map((entry) => (
            <section key={entry.title}>
              <h3 className="text-sm font-medium text-primary-text">{entry.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{entry.blurb}</p>
              <div className="mt-2 flex items-start gap-2 rounded border border-line-subtle bg-surface-raised px-3 py-2">
                <pre className="flex-1 overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-ink-primary">
                  {entry.example}
                </pre>
                <CopyButton text={entry.example} />
              </div>
              {entry.notes && (
                <ul className="mt-2 space-y-1">
                  {entry.notes.map((note) => (
                    <li key={note} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                      <span aria-hidden className="text-ink-muted">
                        •
                      </span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* The tag vocabulary in one glance — the table the Help button is for. */}
          <section>
            <h3 className="text-sm font-medium text-primary-text">Tag reference</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Every tag the player understands, and what it does.
            </p>
            <div className="mt-2 divide-y divide-line-subtle rounded border border-line-subtle">
              {TAG_REFERENCE.map((tag) => (
                <div key={tag.tag} className="flex items-baseline gap-3 px-3 py-1.5">
                  <code className="w-28 shrink-0 font-mono text-xs text-ink-primary">{tag.tag}</code>
                  <span className="text-xs leading-relaxed text-ink-muted">{tag.does}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Generated from the kit itself, so the list can never drift. */}
          <section>
            <h3 className="text-sm font-medium text-primary-text">Drum patterns</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Names you can put on the Drums: line.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DRUM_PATTERNS.map((p) => (
                <span
                  key={p.name}
                  className="rounded border border-line-subtle bg-surface-raised px-2 py-1 font-mono text-[0.7rem] text-ink-muted"
                >
                  {p.name}
                </span>
              ))}
            </div>
          </section>

          {/* Same trick for the accents — the roster is the list. */}
          <section>
            <h3 className="text-sm font-medium text-primary-text">Shimmer accents</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              What the shimmer layer can play. Name one on the Drums: line, or pick it in preview.
            </p>
            {ACCENT_GROUPS.map((group) => (
              <div key={group.label} className="mt-2">
                <p className="text-[0.7rem] uppercase tracking-wide text-ink-muted">{group.label}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {group.items.map((item) => (
                    <span
                      key={item.name}
                      title={item.description}
                      className="rounded border border-line-subtle bg-surface-raised px-2 py-1 font-mono text-[0.7rem] text-ink-muted"
                    >
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>

        {/* Footer */}
        <Flex align="center" justify="end" className="border-t border-line-subtle px-4 py-3">
          <Button size="3" onClick={onClose}>
            Got it
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
