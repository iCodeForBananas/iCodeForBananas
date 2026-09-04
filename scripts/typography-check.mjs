/**
 * Proves the lead sheet document pane holds column alignment.
 *
 * This is the one typographic property the product cannot ship without: a
 * chord has to stay over the syllable it belongs to, whatever the lyric under
 * it says. Font metrics are not knowable from the source, so this drives a real
 * browser against the built app and measures what was actually laid out.
 *
 * Usage:  npm run build && npm start,  then  npm run type:check
 * Point it elsewhere with BASE_URL.
 */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage();

/**
 * Chromium lays out in 1/64px units, so two genuinely identical advances can
 * report a hair apart. This is well above that quantum and far below anything
 * a reader could see; a real alignment bug is off by a whole cell.
 */
const EPSILON = 0.05;

/** "GeistMono", ui-monospace, ... and GeistMono, ui-monospace, ... are the same. */
const firstFamily = (stack) => stack.split(",")[0].trim().replace(/^["']|["']$/g, "");

const fail = [];
const check = (label, ok, detail = "") => {
  if (!ok) fail.push(`${label}${detail ? `: ${detail}` : ""}`);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

await page.goto(`${BASE}/lead-sheet-editor`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => document.fonts.ready);

// ─── The three families are wired ────────────────────────────────────────────

console.log("\nfamilies");
const families = await page.evaluate(() => {
  const root = getComputedStyle(document.body);
  const probe = document.createElement("p");
  probe.className = "leadsheet-doc";
  probe.textContent = "x";
  document.body.appendChild(probe);
  const doc = getComputedStyle(probe);
  const out = {
    sans: root.getPropertyValue("--font-sans").trim(),
    mono: root.getPropertyValue("--font-mono").trim(),
    display: root.getPropertyValue("--font-display").trim(),
    docFamily: doc.fontFamily,
    docNumeric: doc.fontVariantNumeric,
    docLigatures: doc.fontVariantLigatures,
  };
  probe.remove();
  return out;
});
check("--font-sans is bound", families.sans.length > 0, families.sans.slice(0, 40));
check("--font-mono is bound", families.mono.length > 0, families.mono.slice(0, 40));
check("--font-display is bound", families.display.length > 0, families.display.slice(0, 40));
check("doc pane uses the mono family",
  families.mono !== "" && firstFamily(families.docFamily) === firstFamily(families.mono),
  firstFamily(families.docFamily));
check("doc pane sets tabular-nums", families.docNumeric.includes("tabular-nums"), families.docNumeric);
check("doc pane disables ligatures", families.docLigatures === "none", families.docLigatures);

// ─── The type scale reaches the browser ──────────────────────────────────────

console.log("\ntype scale");
const scale = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const read = (n) => ({
    size: root.getPropertyValue(`--ds-font-size-${n}`).trim(),
    tracking: root.getPropertyValue(`--ds-font-tracking-${n}`).trim(),
    leading: root.getPropertyValue(`--ds-font-leading-${n}`).trim(),
  });
  return Object.fromEntries([10, 12, 13, 15, 16, 17, 20, 24, 32, 48].map((n) => [n, read(n)]));
});
const steps = Object.entries(scale);
check("all ten steps resolve", steps.every(([n, v]) => v.size === `${n}px` && v.leading !== ""));
check("tracking is normal below 16px", steps.filter(([n]) => +n < 16).every(([, v]) => v.tracking === "0em"));
check("tracking tightens as size grows",
  steps.filter(([n]) => +n >= 16).map(([, v]) => parseFloat(v.tracking)).every((t, i, a) => i === 0 || t < a[i - 1]));
check("display size reaches -0.022em", parseFloat(scale[48].tracking) === -0.022, scale[48].tracking);
check("no weight above 600 in the scale",
  await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ds-font-weight-emphasis").trim()) === "600");

// ─── Alignment ───────────────────────────────────────────────────────────────
//
// Everything below measures a fixture injected into the real page, so it sees
// the same fonts, at the same sizes, that the app renders with.

const measure = await page.evaluate(async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;font-size:16px";
  document.body.appendChild(host);

  const line = (text, extra = "") => {
    const p = document.createElement("p");
    p.className = "leadsheet-doc";
    p.style.cssText = `white-space:pre;margin:0;${extra}`;
    p.textContent = text;
    host.appendChild(p);
    return p;
  };

  /** The x offset and width of one character, via a Range over the text node. */
  const cell = (p, index) => {
    const range = document.createRange();
    range.setStart(p.firstChild, index);
    range.setEnd(p.firstChild, index + 1);
    const r = range.getBoundingClientRect();
    return { x: r.x - host.getBoundingClientRect().x, w: r.width };
  };

  const glyphs = "ABCDEFG#b/msu0123456789Wil ".split("");
  const glyphLine = line(glyphs.join(""));
  const widths = glyphs.map((_, i) => cell(glyphLine, i).w);

  // Same chord, wildly different lyric after it.
  const short = line("[G]Twinkle");
  const long = line("[G]Twinkle twinkle little star how I wonder what you are tonight");

  // A chord row over a lyric row, the shape a lead sheet actually takes.
  const chordRow = line("C       G       Am      F");
  const lyricRow = line("Twinkle twinkle little  star");

  // The same text at body weight and at the system's heaviest weight.
  const at400 = line("[F#m7]Bright and [Bb/D]early", "font-weight:400");
  const at600 = line("[F#m7]Bright and [Bb/D]early", "font-weight:600");

  const out = {
    widths,
    chordXShort: cell(short, 0).x,
    chordXLong: cell(long, 0).x,
    col7Short: cell(short, 7).x,
    col7Long: cell(long, 7).x,
    columns: [0, 8, 16, 24].map((i) => ({ chord: cell(chordRow, i).x, lyric: cell(lyricRow, i).x })),
    width400: at400.getBoundingClientRect().width,
    width600: at600.getBoundingClientRect().width,
    lineHeight: getComputedStyle(chordRow).lineHeight,
  };
  host.remove();
  return out;
});

console.log("\nalignment");
const spread = Math.max(...measure.widths) - Math.min(...measure.widths);
check("every glyph advances by the same width", spread < EPSILON, `spread ${spread.toFixed(4)}px over ${measure.widths.length} glyphs`);
check("a chord does not move when the lyric grows",
  Math.abs(measure.chordXShort - measure.chordXLong) < EPSILON,
  `${measure.chordXShort.toFixed(3)} vs ${measure.chordXLong.toFixed(3)}`);
check("column 7 lands at the same x on both lines",
  Math.abs(measure.col7Short - measure.col7Long) < EPSILON,
  `${measure.col7Short.toFixed(3)} vs ${measure.col7Long.toFixed(3)}`);
for (const [i, { chord, lyric }] of measure.columns.entries()) {
  check(`chord row and lyric row agree at column ${[0, 8, 16, 24][i]}`,
    Math.abs(chord - lyric) < EPSILON, `${chord.toFixed(3)} vs ${lyric.toFixed(3)}`);
}
check("weight 600 does not widen the line",
  Math.abs(measure.width400 - measure.width600) < EPSILON,
  `${measure.width400.toFixed(3)} vs ${measure.width600.toFixed(3)}`);

await browser.close();
if (fail.length) {
  console.error(`\n${fail.length} failing:\n` + fail.join("\n") + "\n");
  process.exit(1);
}
console.log("\nall assertions passed\n");
