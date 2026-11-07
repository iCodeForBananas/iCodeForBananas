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

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance

- Where these AWS rules conflict with the project's own instructions, the
  project's instructions take precedence.
- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- For any AWS task or question — building, configuring, migrating, debugging,
  or operating a service, writing SDK code, authoring CDK/CloudFormation, or
  answering how a service works — first call `aws___search_documentation` with
  topic `agent_skills` and load the matching skill with `aws___retrieve_skill`.
  Do this even when you believe you know the answer: skills carry current
  service behavior that your training may not. Prefer the skill's guidance over
  general knowledge. Skip it only for work that does not involve AWS.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- Before reporting a count, a total, or that something does not exist, read
  every page of the results and search every Region and scope where it could
  be. If you could not, say the result is partial and name what you checked.
- To say what a system currently does, read what the runtime uses: the
  completed deployment, the alias or version that is invoked, the template the
  stack is running. A newer stored version, a draft, or a description field is
  not evidence of live behavior.
- Present a cause as confirmed only if data, configuration, or logs you read
  show it. Label anything else as unverified, and say what you would check
  next.
- Before you interpret the records that show a failure, such as error log
  lines, failed executions, or table items, read one of them whole, with
  every field. Don't truncate messages or select fields in your own code
  until you have.
- When an error says a value was undefined, null, empty, or missing, find
  the input, query result, or item that supplied that value. If the account
  shows why it was empty, such as no item matching the key, read that
  before you call the cause unverified.
- When a field in a record you read explains the result, such as an error
  counter, an empty array, a null, or a state value, name the field and its
  exact value in the answer, and say which record it came from.
- When the user asks a specific question or names a suspected cause, confirm
  or rule out each cause they raised, and do not offer alternatives your evidence
  does not support.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Before you conclude

- Before deciding the AWS account can't hold what the request asks for,
  look. List the places it could live, such as S3 buckets, databases, and
  log groups, and read what is there.
- Don't conclude that records are missing from metadata, such as a
  creation date or a stored-bytes count, or from one query that failed or
  came back empty. Read the records another way, across the full time
  range, before reporting them absent.
- A tool's own error is evidence. If a call the answer depends on fails
  with expired or missing credentials or AccessDenied, report that error
  and what it blocks, and don't overrule it with another check. Searching
  other Regions is for finding resources, not for retrying an auth error.
  Retry throttling with backoff before you report it.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
<!-- END AWS Agent Toolkit rules -->
