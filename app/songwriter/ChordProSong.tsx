import { layoutLine, type Line, type Section, type Song } from "@/app/lib/chordPro";
import {
  formatKey,
  NO_CAPO_NO_TRANSPOSE,
  parseKey,
  readChordInView,
  shapeKey,
  soundingKey,
  type Key,
  type View,
} from "@/app/lib/harmony";
import { cn } from "@/app/lib/utils";

/**
 * Renders a song as chords over lyrics. No hooks, so it stays a Server
 * Component: a chart is a document, and the controls that change how it is read
 * live outside it in the `view` prop.
 */

/** Everything the reader needs to know about what key they are looking at. */
function KeyLine({ written, view }: { written: Key | null; view: View }) {
  if (!written) return null;
  const sounding = soundingKey(written, view);
  const shapes = shapeKey(written, view);
  const parts = [`Key of ${formatKey(sounding)}`];

  // The declared key is never rewritten, so when a reading differs from it the
  // chart says so rather than quietly showing something else.
  if (view.transpose !== 0) parts.push(`written in ${formatKey(written)}`);
  if (view.capo !== 0) parts.push(`capo ${view.capo}, shapes in ${formatKey(shapes)}`);

  return <p className='text-12 text-ink-muted'>{parts.join("  ·  ")}</p>;
}

function LyricLine({
  line,
  written,
  view,
  large,
}: {
  line: Extract<Line, { kind: "lyric" }>;
  written: Key | null;
  view: View;
  large: boolean;
}) {
  // Transposed before layout, not after: a chord that changes width changes
  // where everything after it sits.
  const moved = line.segments.map((segment) => ({
    ...segment,
    chord: segment.chord === null ? null : readChordInView(segment.chord, written, view),
  }));
  const { chords, lyrics } = layoutLine(moved);

  return (
    <div className={cn("leadsheet-doc whitespace-pre", large ? "text-20" : "text-16")}>
      {chords !== "" && (
        <span className='block font-semibold text-primary-text' aria-hidden>
          {chords}
        </span>
      )}
      {/* A non-breaking space keeps an empty lyric row from collapsing, which
          would close the gap a bar of instrumental is asking for. */}
      <span className='block text-ink-primary'>{lyrics === "" ? " " : lyrics}</span>
    </div>
  );
}

function SectionBlock({
  section,
  written,
  view,
  large,
}: {
  section: Section;
  written: Key | null;
  view: View;
  large: boolean;
}) {
  const heading = section.label ?? (section.kind === "other" ? null : section.kind);
  return (
    <section className='mb-6 break-inside-avoid last:mb-0'>
      {heading && (
        <h3 className='mb-1 font-sans text-10 font-semibold uppercase tracking-wide text-ink-muted'>
          {heading}
        </h3>
      )}
      {section.lines.map((line, i) => {
        if (line.kind === "lyric") {
          return <LyricLine key={i} line={line} written={written} view={view} large={large} />;
        }
        if (line.kind === "comment") {
          return (
            <p key={i} className='my-1 font-sans text-12 italic text-ink-muted'>
              {line.text}
            </p>
          );
        }
        if (line.kind === "unknown") return null;
        return <div key={i} className='h-4' aria-hidden />;
      })}
    </section>
  );
}

export function ChordProSong({
  song,
  view = NO_CAPO_NO_TRANSPOSE,
  large = false,
  className,
}: {
  song: Song;
  /** How the song is being read. Does not change the song. */
  view?: View;
  /** Performance mode: the same chart, at a distance. */
  large?: boolean;
  className?: string;
}) {
  const written = song.meta.key ? parseKey(song.meta.key) : null;

  return (
    <article className={cn("text-ink-primary", className)}>
      <header className='mb-6'>
        {song.meta.title && (
          <h1 className={cn("font-display", large ? "text-32" : "text-24")}>{song.meta.title}</h1>
        )}
        {song.meta.artist && <p className='text-13 text-ink-muted'>{song.meta.artist}</p>}
        <KeyLine written={written} view={view} />
        {(song.meta.tempo || song.meta.time) && (
          <p className='text-12 text-ink-muted'>
            {[song.meta.tempo && `${song.meta.tempo} bpm`, song.meta.time].filter(Boolean).join("  ·  ")}
          </p>
        )}
      </header>

      {song.sections.map((section, i) => (
        <SectionBlock key={i} section={section} written={written} view={view} large={large} />
      ))}
    </article>
  );
}
