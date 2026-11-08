# Design tokens

Source of truth for the whole app's visual language — every tool, not just the
songwriting one. W3C DTCG format (`$value` / `$type`). Compiled to
`app/tokens.css` by `npm run tokens:build`, which is committed alongside the
JSON so a plain `npm run build` never has to run Style Dictionary.

```
npm run tokens:build   # tokens/ -> app/tokens.css
npm run tokens:check   # WCAG contrast, both themes, against the generated CSS
```

## Three layers

**Layer 1, primitives** (`primitives/`). Raw values, no meaning. Colors in
OKLCH. Identical in every theme. Component code never names these.

## The palette

Both themes are the iCodeForBananas iTerm schemes
([github.com/iCodeForBananas/itermcolors](https://github.com/iCodeForBananas/itermcolors)),
imported slot for slot into `palette.dark` and `palette.light`. Each value is
converted to OKLCH losslessly and round-trips to the hex in its description.
Each job sits on the same slot in both themes:

| Job | iTerm slot | Dark | Light |
|---|---|---|---|
| `surface.base` | Background | `#0f1114` | `#fdfcfa` |
| `surface.raised` | Cursor Guide | `#1b1e23` | `#f1eee6` |
| `text.primary` | Foreground | `#e6e8eb` | `#0a0c0e` |
| `text.muted` | ANSI black / white | `#98a2b0` | `#3f464e` |
| `primary.solid`, `primary.text`, `focus-ring` | Cursor | `#ffcc00` | `#755000` |
| `primary.hover` | bright yellow / yellow | `#f2cc60` | `#8a5a00` |
| `text.on-primary` | Cursor Text | `#0f1114` | `#fdfcfa` |
| `selection.background` | Selection | `#27456b` | `#bbd6f5` |
| `link` | Link | `#a5d6ff` | `#0b5fd0` |
| `danger` / `success` | ANSI red / green | `#ff8a82` / `#6fd28a` | `#c21f2e` / `#157a34` |
| `accent.solid` | ANSI cyan | `#56d4dd` | `#0d7478` |
| `track.1`-`.6` | ANSI blue, magenta, red, cyan, green, yellow | | |

`color.ansi.*` exposes the six hues and their bright variants for what has no
semantic name of its own: indicator lines on a chart, Radix's `color` prop.

A terminal has one background and one highlighted line; the app has four
surface planes. `palette.derived` holds the only colors that are not iTerm
slots, the planes the schemes do not have, continued from their own anchors.

**Layer 2, semantics** (`semantic/`, `themes/`). Purpose-named aliases that
reference Layer 1 by path. This is the only layer component code is allowed to
name. Names describe the job a value does, never what it looks like, so
repointing a primitive leaves the file still reading correctly.

**Layer 3, component tokens.** Does not exist yet, on purpose. Add one only
when a component genuinely needs a knob of its own, not in advance.

## Track colours

`color.track.1` to `.6` are a categorical set, for things that differ in kind
rather than in importance: a recorded track, a drum voice, a pad. They are the
one place a colour carries identity instead of meaning, which is why they are a
flat set rather than a ramp and why none of them is the primary. Assign them in
order and let them repeat. A filled swatch takes `text.on-primary` as its label.

## Themes

Dark is the default and lives on `:root`. `[data-theme="light"]` overrides
Layer 2 semantics and nothing else. A value that has to change between themes
is fixed by pointing the semantic alias at a different primitive, never by
redefining the primitive.

`data-theme` on `<html>` is the only switch. `app/lib/ThemeContext.tsx` writes
it and the inline script in `app/layout.tsx` writes it again before first
paint; `globals.css` points Tailwind's `dark:` variant at the same attribute,
so a rule written with the variant and a rule written with a token cannot
disagree about which theme is on. There is no `.dark` class any more, and no
`dark:` variant left in the app either — a semantic token already carries both
themes, which is the whole point of having them.

Light lists every color role, because every role reads a different scheme.

## Labels on a fill

`text.on-primary` is the scheme's Cursor Text, and it flips with the theme:
near-black on the dark scheme's bright cursor and pastels, near-white on the
light scheme's deep ones. **Put it on any filled accent, status or track color,
and never hard-code white or black on a fill.** `npm run tokens:check` enforces
the pairs. A tint (`bg-track-3/25`) reads as the surface under it, so it takes
`text.primary` instead.

## Typography

Two families, loaded by `next/font` and self-hosted at build time:

| | | |
|---|---|---|
| `--font-sans` | Roboto | UI chrome, song titles, library headers — everything but the document pane |
| `--font-mono` | Geist Mono | the lyric and chord document pane |

`--font-display` still exists as a class name — `font-display` reads as "this
is a title" at the call site — but it is now an alias for `--ds-font-sans`
rather than a second family. It used to be Fraunces, loaded as a variable font
for its optical-size axis; that axis, and the family, are gone, and nothing
else in the type scale asked for a serif.

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
  label from the primary button once. `app/lib/utils.test.ts` pins it.
- **No `outline-none` on a focusable control.** In Tailwind v4 it sets the
  outline style through a variable that `focus-visible:outline-2` then reads,
  so the two together produce a 2px outline that does not draw. Write
  `focus-visible:outline-solid` and leave the default alone.

## Buttons

`app/components/ui/button.tsx` is the only button. Nothing else imports Radix's
`Button` or `IconButton`. A call site says what the button is for, and the look
lives in that one file:

| | |
|---|---|
| `variant` | `primary` (the one action that matters most), `secondary` (default), `ghost`, `danger` |
| `size` | `sm` 24, `md` 32, `lg` 40, `xl` 48; `icon-sm`, `icon`, `icon-lg`, `icon-xl` for a lone icon |

A choice among options is a `ToggleButton`, which is the same button with a
pressed state. A raw `<button>` is only for something that is not visually a
button: a list row, a sequencer cell, a game's answer tile.

## Spacing and radius

Spacing is the 4px scale, and these are the steps: `1 2 3 4 6 8 12`, plus
`16 20 24` for page-level rhythm and clearing a fixed bar. Half steps and `5`,
`7`, `9`, `10`, `11` are off the scale. CSS outside Tailwind uses
`var(--ds-space-*)`.

Radius is three steps: `rounded-md` for a control, `rounded-lg` for a card,
dialog or panel, `rounded-full` for a dot, avatar or pill.

## What is deliberately not on the system

**Painted scenes.** `app/shoot-simulator/ShootSimulator.tsx` is a night street
drawn into a canvas — brick, bark, neon, graffiti, robots — and
`SpaceBackground` in `app/space-math/SpaceMathPage.tsx` is a starfield. Layer 2
has nothing to say about what colour a comet tail is, and flattening a scene
into sixteen terminal colours would delete the artwork rather than standardise
it. The chrome around both is on the tokens.

That is the only exception. Grepping `app/` for a colour literal or a Tailwind
palette class returns those two scenes, plus the print stylesheet, where white
paper and black ink are the point.

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

Two dark-scheme hues, red and magenta, sit on the edge of sRGB and report as
out of gamut in `tokens:check` by a rounding error. They render as their hex.

The build pipeline (Lightning CSS, via Tailwind v4) rewrites every `oklch()`
into a hex fallback plus an exact `lab()`. That is why grepping the built CSS
for `oklch` finds nothing; the colors are unchanged.
