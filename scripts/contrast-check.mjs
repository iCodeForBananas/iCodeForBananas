/**
 * Verifies the semantic tokens against WCAG contrast targets, reading the
 * generated app/tokens.css rather than the JSON so that what is checked is
 * exactly what ships.
 *
 * Run with `npm run tokens:check`. Exits non-zero if any pair misses its
 * target without a recorded mitigation.
 *
 * Targets: 4.5:1 for normal text, 3:1 for large text and for the boundary of
 * an interactive element.
 */
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../app/tokens.css", import.meta.url), "utf8");

// ─── Reading the generated stylesheet ────────────────────────────────────────

/** Every `--ds-*: value;` inside one selector block, in source order. */
function blockVars(selector) {
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in app/tokens.css`);
  const body = CSS.slice(start, CSS.indexOf("}", start));
  const vars = {};
  for (const [, name, value] of body.matchAll(/(--ds-[\w-]+):\s*([^;]+);/g)) {
    vars[name] = value.trim();
  }
  return vars;
}

const root = blockVars(":root");
const lightOverrides = blockVars('[data-theme="light"]');
const themes = { dark: root, light: { ...root, ...lightOverrides } };

/** Follow var() references until a literal color falls out. */
function resolve(theme, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`circular reference at ${name}`);
  seen.add(name);
  const raw = theme[name];
  if (raw === undefined) throw new Error(`undefined token ${name}`);
  const ref = raw.match(/^var\((--ds-[\w-]+)\)$/);
  return ref ? resolve(theme, ref[1], seen) : raw;
}

// ─── OKLCH to sRGB ───────────────────────────────────────────────────────────

function parseOklch(css) {
  const m = css.match(
    /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/
  );
  if (!m) throw new Error(`not an oklch() value: ${css}`);
  const [, L, C, H, alpha] = m;
  return { L: +L, C: +C, H: +H, alpha: alpha === undefined ? 1 : +alpha };
}

/** OKLCH to linear-light sRGB, before any gamut handling. */
function toLinearRgb({ L, C, H }) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp = (c) => Math.min(1, Math.max(0, c));

/**
 * Linear sRGB clipped through the 8-bit display pipeline. Clipping in gamma
 * space rather than linear space matters: an out-of-gamut OKLCH value would
 * otherwise report a luminance no screen can actually show, which is exactly
 * the kind of optimism a contrast check exists to prevent.
 */
function displayLinear(color) {
  return toLinearRgb(color).map((c) => decode(clamp(encode(c))));
}

const inGamut = (color) =>
  toLinearRgb(color).every((c) => c >= -0.0001 && c <= 1.0001);

/** The most chroma sRGB can actually show at a given lightness and hue. */
function maxChroma({ L, H }) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ L, C: mid, H })) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Composite a translucent color over an opaque one, in linear light. */
function over(fg, bg) {
  const f = displayLinear(fg);
  const b = displayLinear(bg);
  return f.map((c, i) => c * fg.alpha + b[i] * (1 - fg.alpha));
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function contrast(fgCss, bgCss) {
  const fg = parseOklch(fgCss);
  const bg = parseOklch(bgCss);
  if (bg.alpha !== 1) throw new Error("background must be opaque");
  const a = luminance(fg.alpha === 1 ? displayLinear(fg) : over(fg, bg));
  const b = luminance(displayLinear(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ─── What has to hold ────────────────────────────────────────────────────────

const S = "--ds-color-surface";
const T = "--ds-color-text";
const P = "--ds-color-primary";

/**
 * `min` is the WCAG target. `mitigation` marks a pair that cannot meet its
 * target from Layer 2 alone and names what the component must do instead; those
 * are reported but do not fail the run, because the fix does not live here.
 */
const CHECKS = [
  // Body and secondary copy, on every surface it can land on.
  ...["sunken", "base", "raised", "overlay"].map((s) => ({
    fg: `${T}-primary`, bg: `${S}-${s}`, min: 4.5, label: `text.primary on surface.${s}`,
  })),
  ...["base", "raised", "overlay"].map((s) => ({
    fg: `${T}-muted`, bg: `${S}-${s}`, min: 4.5, label: `text.muted on surface.${s}`,
  })),

  // The amber accent as text. This is the pair the spec singles out, and the
  // one that forced primary.text to differ between themes.
  ...["base", "raised", "overlay"].map((s) => ({
    fg: `${P}-text`, bg: `${S}-${s}`, min: 4.5, label: `primary.text on surface.${s}`,
  })),

  // The hard rule: the label on a filled amber control.
  { fg: `${T}-on-primary`, bg: `${P}-solid`, min: 4.5, label: "text.on-primary on primary.solid" },
  { fg: `${T}-on-primary`, bg: `${P}-hover`, min: 4.5, label: "text.on-primary on primary.hover" },

  // Status colors as text.
  { fg: "--ds-color-danger", bg: `${S}-base`, min: 4.5, label: "danger on surface.base" },
  { fg: "--ds-color-success", bg: `${S}-base`, min: 4.5, label: "success on surface.base" },

  // Non-text contrast: a control's fill or ring against the plane behind it.
  {
    fg: `${P}-solid`, bg: `${S}-base`, min: 3, label: "primary.solid on surface.base",
    mitigation:
      "In light theme, amber at L 0.851 cannot clear 3:1 against a near-white " +
      "surface. A filled amber control on a light surface must draw a " +
      "border.strong outline so its boundary is discernible.",
  },
  { fg: "--ds-color-accent-solid", bg: `${S}-base`, min: 3, label: "accent.solid on surface.base" },

  // The categorical set. Each has to be discernible against the plane it sits
  // on, and each has to carry a label, which is the amber rule again: at this
  // lightness a white label would be the thing that gives.
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
    {
      fg: `--ds-color-track-${n}`, bg: `${S}-base`, min: 3, label: `track.${n} on surface.base`,
      mitigation:
        "Same as the amber button: a fill this saturated cannot clear 3:1 " +
        "against a near-white surface at a lightness that still carries a " +
        "near-black label. On a light surface a track swatch draws a " +
        "border.strong outline for its boundary.",
    },
    { fg: `${T}-on-primary`, bg: `--ds-color-track-${n}`, min: 4.5, label: `text.on-primary on track.${n}` },
  ]),
  { fg: "--ds-color-focus-ring", bg: `${S}-base`, min: 3, label: "focus-ring on surface.base" },
  { fg: "--ds-color-focus-ring", bg: `${S}-overlay`, min: 3, label: "focus-ring on surface.overlay" },
];

// ─── Run ─────────────────────────────────────────────────────────────────────

let failed = 0;
let mitigated = 0;

for (const [themeName, theme] of Object.entries(themes)) {
  console.log(`\n  ${themeName}`);
  for (const check of CHECKS) {
    const ratio = contrast(resolve(theme, check.fg), resolve(theme, check.bg));
    const ok = ratio >= check.min;
    const mark = ok ? "pass" : check.mitigation ? "note" : "FAIL";
    if (!ok) {
      if (check.mitigation) mitigated++;
      else failed++;
    }
    console.log(
      `    ${mark.padEnd(4)} ${ratio.toFixed(2).padStart(6)}:1  (needs ${check.min})  ${check.label}`
    );
    if (!ok && check.mitigation) console.log(`         ${check.mitigation}`);
  }
}

// A token outside sRGB still renders, as the nearest color the display can
// reach, and every ratio above already measures that clipped result. So this is
// reported rather than failed: it says the value is more saturated than an sRGB
// screen can show, which for a brand anchor is a decision, not a defect.
const outOfGamut = Object.entries(root)
  .filter(([, v]) => v.startsWith("oklch("))
  .map(([name, value]) => [name, value, parseOklch(value)])
  .filter(([, , color]) => !inGamut(color));

if (outOfGamut.length) {
  console.log("\n  more saturated than sRGB can show (clipped on an sRGB display,");
  console.log("  rendered as written on P3; the ratios above measure the clipped result):");
  for (const [name, value, color] of outOfGamut) {
    console.log(`    ${name}: ${value}  sRGB max chroma here is ${maxChroma(color).toFixed(3)}`);
  }
}

console.log(`\n  ${failed} failing, ${mitigated} mitigated, ${outOfGamut.length} beyond sRGB\n`);
process.exit(failed > 0 ? 1 : 0);
