# Working in this repo

## Shipping

Push finished work. Don't ask, and don't open a pull request:

1. Commit to the working branch.
2. `git push -u origin <branch>`.
3. Fast-forward `main` to it: `git push origin HEAD:main`.

Only stop and say something if that can't be done cleanly — `main` has moved
ahead so it isn't a fast-forward, or the checks below don't pass. Never push
red.

Before pushing, run all four from the repo root:

```
npx tsc --noEmit
npx eslint <changed files>
npm run build
npm test
```

The repo carries some pre-existing lint warnings and at least one pre-existing
error; what matters is that a change adds none of its own.

## Line endings

`.ts`/`.tsx` files are split between CRLF and LF, per file — there is no
`.gitattributes` and no repo-wide convention. **Match whatever the file already
uses.** Rewriting a file's endings turns a ten-line change into a diff that
touches every line and hides the real edit.

Python's text mode silently normalizes on read and writes back with `os.linesep`,
so edit bytes instead:

```python
raw = open(path, "rb").read()
old = "...".replace("\n", "\r\n").encode()   # for a CRLF file
new = "...".replace("\n", "\r\n").encode()
assert raw.count(old) == 1
open(path, "wb").write(raw.replace(old, new))
```

Some files are internally mixed (a mostly-CRLF file with a couple of bare-LF
lines), which is why a whole-file re-encode is not a safe shortcut. After
editing, `git diff --ignore-all-space --stat` should match `git diff --stat`.

## Tests and verification

Vitest covers the pure logic: chord grammar, transposition, anything that is a
function of its arguments and nothing else. `npm test` runs it, `npm run
test:watch` while working. Tests sit next to what they test as `*.test.ts`.

Anything that depends on how a browser lays text out, resolves a CSS variable,
or picks a font is not testable there. Those live in `scripts/` and drive real
Chromium against a built app: `npm run type:check` for column alignment in the
lead sheet, `npm run tokens:check` for contrast (that one needs no browser).

For anything user-facing beyond what those cover, drive the built app in
Chromium (`/opt/pw-browsers/chromium`, driven by the globally installed
`playwright` at `/opt/node22/lib/node_modules/playwright`) and assert on what
actually rendered rather than only reading the diff.

Supabase is not authorized in remote sessions, so routes that load a sheet or a
song can't be reached. To exercise a component behind one, mount it on a
temporary route, verify, then delete the route before committing.
