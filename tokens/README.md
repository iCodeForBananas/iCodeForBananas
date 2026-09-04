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
