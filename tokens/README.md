# Design tokens

Source of truth for the songwriting product's visual language. W3C DTCG format
(`$value` / `$type`). Compiled to `app/tokens.css` by `npm run tokens:build`,
which is committed alongside the JSON so a plain `npm run build` never has to
run Style Dictionary.

```
npm run tokens:build   # tokens/ -> app/tokens.css
npm run tokens:check   # WCAG contrast, both themes, against the generated CSS
```

## Three layers

**Layer 1, primitives** (`primitives/`). Raw values, no meaning. Colors in
OKLCH. Identical in every theme. Component code never names these.

**Layer 2, semantics** (`semantic/`, `themes/`). Purpose-named aliases that
reference Layer 1 by path. This is the only layer component code is allowed to
name. Names describe the job a value does, never what it looks like, so
repointing a primitive leaves the file still reading correctly.

**Layer 3, component tokens.** Does not exist yet, on purpose. Add one only
when a component genuinely needs a knob of its own, not in advance.

## Themes

Dark is the default and lives on `:root`. `[data-theme="light"]` overrides
Layer 2 semantics and nothing else. A value that has to change between themes
is fixed by pointing the semantic alias at a different primitive, never by
redefining the primitive.

Anything a theme does not list inherits its dark value deliberately. That is
why `color.text.on-primary` and `color.primary.solid` appear only once.

## The amber rule

`color.primary.solid` is a light color (L 0.851). White on it lands near
1.4:1; the near-black `color.text.on-primary` lands near 11:1. **The label on a
filled amber control is never white.** `npm run tokens:check` enforces this,
and `palette.amber.contrast` carries the long-form explanation.

The same physics forces `color.primary.text`, `color.danger`, `color.success`
and `color.accent.solid` to differ between themes: no single lightness is
legible as text on both a near-black and a near-white surface.

## Typography

Three families, loaded by `next/font` and self-hosted at build time:

| | | |
|---|---|---|
| `--font-sans` | Geist Sans | UI chrome |
| `--font-mono` | Geist Mono | the lyric and chord document pane |
| `--font-display` | Fraunces, optical sizing on | song titles and library headers, nothing else |

The stacks live on `:root` in `app/globals.css` as `--ds-font-*`, not in this
directory, because only that file knows the variable names `next/font`
generates. Two things about that wiring are easy to break:

- The generated font variables go on `<html>`, not `<body>`. A custom property
  on `:root` that references a variable defined further down the tree computes
  to nothing, and every rule using it silently falls back to the inherited
  family.
- `@theme inline` emits the keys it declares, so naming the source variable
  `--font-mono` as well would produce `--font-mono: var(--font-mono)`. That
  self-reference leaves the property invalid at computed-value time, with the
  same silent fallback. Hence the `--ds-` indirection.

The scale is `font.size` / `font.tracking` / `font.leading` here, mapped onto
Tailwind's `--text-*` so one class carries size, tracking and leading together:
`text-32` is the whole typographic decision, not a size that then needs two
more classes to look right.

Weights stop at 600. See `font.weight`.

### Column alignment

The document pane is `.leadsheet-doc`: the mono family, `tabular-nums`, and
ligatures off, so every glyph advances by the same width and a chord stays over
the syllable it belongs to. `npm run type:check` drives a real browser and
measures it, because font metrics are not knowable from the source. It proves a
chord does not move when the lyric under it grows, that a chord row and a lyric
row agree column for column, that digits do not shift, and that weight 600 does
not widen a line.

It needs the app running (`npm run build && npm start`), and takes `BASE_URL`.

## Components

`app/components/ui/` is the component base: Base UI primitives for behaviour,
this token system for everything visible. It holds no colour, spacing, radius or
duration literal at all; a few one-off layout values (a blur radius, a viewport
offset, a scale factor) are written inline because they are none of those four
and belong to one component.

Elevation is the surface step, sunken to base to raised to overlay. `shadow`
only adds what a step cannot: one soft shadow plus a hairline inset highlight,
and a stronger one for an overlay that has to read as detached.

Two things in this layer are load-bearing and easy to undo:

- **`cn()` is taught the type scale.** `text-13` is a size and
  `text-ink-muted` is a colour, and tailwind-merge cannot tell them apart, so
  by default it files them together and keeps one. That silently deleted the
  near-black label from the primary button and left near-white text on amber.
  `app/lib/utils.test.ts` pins it.
- **No `outline-none` on a focusable control.** In Tailwind v4 it sets the
  outline style through a variable that `focus-visible:outline-2` then reads,
  so the two together produce a 2px outline that does not draw. Write
  `focus-visible:outline-solid` and leave the default alone.

## What is deliberately not tokenized here

Spacing, radii and durations exist as tokens but are **not** mapped into
Tailwind's `@theme`, because Tailwind's own defaults are already the same
scale and a second declaration would be a second source of truth that drifts:

| | |
|---|---|
| spacing | `space.16` is `p-4`. Tailwind's numeric scale is the same 4px scale. |
| radius | `rounded-md` is 6px, the workhorse. `xs`/`sm`/`md`/`lg`/`xl`/`2xl` are already 2/4/6/8/12/16. |
| duration | `duration-120` / `180` / `240` / `320` compile natively. |

The tokens exist so CSS written outside Tailwind resolves to the same numbers.

## Gamut

Two brand anchors, `palette.amber.hover` and `palette.amber.text`, are more
saturated than sRGB can show. They render as written on a P3 display and clip
to the gamut edge on an sRGB one. `tokens:check` reports them and measures the
clipped result, so the contrast numbers hold on either display.

The build pipeline (Lightning CSS, via Tailwind v4) rewrites every `oklch()`
into a hex fallback plus an exact `lab()`. That is why grepping the built CSS
for `oklch` finds nothing; the colors are unchanged.
