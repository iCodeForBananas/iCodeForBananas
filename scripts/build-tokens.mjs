/**
 * Compiles tokens/ into app/tokens.css.
 *
 * Run with `npm run tokens:build`. The output is generated and committed, so
 * that a plain `npm run build` never has to run Style Dictionary; treat
 * app/tokens.css as read-only and edit the JSON under tokens/ instead.
 *
 * The one thing this does that Style Dictionary cannot do out of the box is
 * emit two selectors into a single file: :root carries Layer 1 plus the dark
 * Layer 2, and [data-theme="light"] carries only the semantics that light
 * overrides. That is why there is a custom format rather than two builds.
 */
import StyleDictionary from "style-dictionary";
import { createPropertyFormatter } from "style-dictionary/utils";

const PREFIX = "ds";

/** Tokens under the `light` group are the light-theme Layer 2 overrides. */
const isLightTheme = (token) => token.path[0] === "light";

/**
 * DTCG stores a cubic bezier as its four control points. CSS wants them inside
 * a cubic-bezier() call, and Style Dictionary's own css transform group does
 * not reliably cover this type, so it is done here.
 */
StyleDictionary.registerTransform({
  name: "cubicBezier/css",
  type: "value",
  filter: (token) => token.$type === "cubicBezier" || token.type === "cubicBezier",
  transform: (token) => {
    const points = token.$value ?? token.value;
    return Array.isArray(points) ? `cubic-bezier(${points.join(", ")})` : points;
  },
});

StyleDictionary.registerFormat({
  name: "css/themed-variables",
  format: ({ dictionary, options }) => {
    const declare = createPropertyFormatter({
      dictionary,
      outputReferences: options.outputReferences,
      usesDtcg: options.usesDtcg,
      format: "css",
    });

    // Light-theme tokens are named --ds-light-color-* so they never collide
    // with their dark counterparts inside the dictionary. They have to land in
    // the stylesheet under the same name they override, so the group segment
    // comes back off here. Only the property name is rewritten; the value side
    // of a light token only ever references palette tokens, which are unprefixed.
    const unscope = (line) => line.replace(`--${PREFIX}-light-color-`, `--${PREFIX}-color-`);

    const root = dictionary.allTokens.filter((t) => !isLightTheme(t)).map(declare);
    const light = dictionary.allTokens.filter(isLightTheme).map(declare).map(unscope);

    return [
      "/**",
      " * GENERATED FILE. Do not edit.",
      " *",
      " * Source: tokens/ (W3C DTCG format). Rebuild with `npm run tokens:build`.",
      " *",
      " * Dark is the default and lives on :root. Light overrides Layer 2",
      " * semantics only; Layer 1 primitives are identical in both themes.",
      " */",
      "",
      ":root {",
      ...root,
      "}",
      "",
      '[data-theme="light"] {',
      ...light,
      "}",
      "",
    ].join("\n");
  },
});

const sd = new StyleDictionary({
  source: ["tokens/**/*.json"],
  usesDtcg: true,
  platforms: {
    css: {
      prefix: PREFIX,
      // Deliberately not the built-in `css` transform group: its `color/css`
      // transform round-trips every color through a parser and emits hex or
      // rgb(), which would flatten every OKLCH value in the system. Colors are
      // already written as valid CSS and are passed through untouched.
      transforms: ["attribute/cti", "name/kebab", "cubicBezier/css"],
      buildPath: "app/",
      files: [
        {
          destination: "tokens.css",
          format: "css/themed-variables",
          options: { outputReferences: true },
        },
      ],
    },
  },
});

await sd.hasInitialized;
await sd.buildAllPlatforms();
