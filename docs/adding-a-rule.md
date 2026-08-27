# Adding a rule

A worked example, start to finish. The goal is that this takes an afternoon,
not a weekend.

We will add `security/cookie-missing-httponly`: a session cookie set without
`httpOnly`, which makes it readable by any JavaScript on the page and therefore
stealable by any XSS.

## 0. Decide whether it should be a rule

Three questions. If the answer to any is no, it probably belongs in
documentation instead.

**Is it specific?** "Session cookie set without httpOnly" — yes. "Cookies might
be insecure" — no.

**Is it statically decidable with reasonable confidence?** We can see
`cookies().set(...)` and whether the options object contains `httpOnly`. Yes.

**Is the remediation actionable?** "Add `httpOnly: true` to the cookie
options." Yes.

Also ask what the *near miss* looks like — the correct code that resembles the
broken code. Here it is a non-session cookie (a theme preference) that
legitimately needs to be readable from JavaScript. That case will become a
negative test.

## 1. Write the rule

`src/rules/security/cookie-missing-httponly.ts`:

```ts
import { defineRule } from '../../core/define-rule.js';
import { callArgumentObject, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** `cookies().set(...)`, `res.cookie(...)` and the Response header form. */
const COOKIE_SET = /\b(?:cookies\(\)\s*\.\s*set|res(?:ponse)?\s*\.\s*cookie)\s*\(/g;

/** Cookie names that carry a session and must not be readable from JavaScript. */
const SESSION_NAME = /(?:session|auth|token|jwt|sid|access|refresh|csrf)/i;

export default defineRule({
  meta: {
    id: 'security/cookie-missing-httponly',
    category: 'security',
    title: 'Session cookie readable from JavaScript',
    severity: 'high',
    confidence: 'medium',
    description:
      'A session cookie is set without httpOnly, so any script running on the page can read it. That turns any cross-site scripting bug - including one in a third-party script you did not write - into full session theft.',
    remediation:
      'Set httpOnly: true on every cookie that carries authentication, along with secure: true and sameSite: "lax". Only cookies the browser genuinely needs to read, such as a theme preference, should omit httpOnly.',
    references: [
      'https://owasp.org/www-community/HttpOnly',
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies',
    ],
    tags: ['cookies', 'xss', 'owasp-a05'],
  },

  checkFile(file, ctx) {
    if (!file.isServer || file.role === 'test') return;

    let reported = 0;
    for (const match of file.matchesText(COOKIE_SET)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;

      const args = callArgumentObject(file, match.index);
      if (args === null) continue;
      if (!SESSION_NAME.test(args)) continue;      // not a session cookie
      if (/httpOnly\s*:/.test(args)) continue;     // already handled

      reported++;
      ctx.report({
        explanation: `${file.path} sets what looks like a session cookie without httpOnly. Any script on the page can read it with document.cookie.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
```

Things worth noticing:

- **`matchesText`, not `matches`.** The cookie name is inside a string literal,
  and the default view blanks string bodies. Comments are still masked in the
  text view, so a commented-out example cannot trigger it. See
  [ARCHITECTURE.md](ARCHITECTURE.md#the-lexer).
- **Two guards before reporting.** Not every cookie is a session cookie, and an
  existing `httpOnly` means the developer already thought about it.
- **`confidence: 'medium'`.** The name heuristic is good but not conclusive.
  Severity stays `high` because that is how bad it is *if* real —
  [confidence and severity are separate](SCORING.md#confidence-multipliers).
- **A finding cap.** `MAX_FINDINGS_PER_RULE` keeps one systemic mistake from
  producing eighty lines of report.

## 2. Register it

`src/rules/index.ts`:

```ts
import securityCookieMissingHttponly from './security/cookie-missing-httponly.js';

export const BUILTIN_RULES: readonly Rule[] = [
  // …
  securityCookieMissingHttponly,
];
```

## 3. Add a positive fixture

Code the rule must fire on, in one of the `fixtures/vulnerable-*` projects.
`fixtures/vulnerable-nextjs/app/api/session/route.ts`:

```ts
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const { token } = await request.json();
  const store = await cookies();
  store.set('session_token', token, { path: '/', maxAge: 3600 });
  return Response.json({ ok: true });
}
```

`tests/integration/fixtures.test.ts` fails the build if a rule never fires on
any vulnerable fixture, so this step is enforced rather than merely encouraged.

## 4. Add a negative fixture

Correct code the rule must **not** fire on, in a `fixtures/secure-*` project.
`fixtures/secure-nextjs/app/api/session/route.ts`:

```ts
import { cookies } from 'next/headers';
import { requireUser } from '../../../lib/auth';

export async function POST(request: Request) {
  const user = await requireUser();
  if (user === null) return new Response('Unauthorized', { status: 401 });

  const { token } = (await request.json()) as { token: string };
  const store = await cookies();
  store.set('session_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });

  return Response.json({ ok: true });
}
```

The same test file asserts the secure fixtures produce **zero** findings. That
is the false-positive budget, and it is zero.

## 5. Add focused cases

`tests/integration/rules.test.ts` is where the boundaries get pinned. The
near-miss cases matter more than the hit:

```ts
describe('security/cookie-missing-httponly', () => {
  it('fires on a session cookie with no httpOnly', async () => {
    const fired = await scanCase({
      'app/api/session/route.ts':
        'import { cookies } from "next/headers";\nexport async function POST() { (await cookies()).set("session_token", "x", { path: "/" }); return Response.json({}); }',
    });
    expect(fired).toContain('security/cookie-missing-httponly');
  });

  it('does not fire when httpOnly is set', async () => {
    const fired = await scanCase({
      'app/api/session/route.ts':
        'import { cookies } from "next/headers";\nexport async function POST() { (await cookies()).set("session_token", "x", { httpOnly: true }); return Response.json({}); }',
    });
    expect(fired).not.toContain('security/cookie-missing-httponly');
  });

  it('does not fire on a preference cookie the browser must read', async () => {
    const fired = await scanCase({
      'app/api/prefs/route.ts':
        'import { cookies } from "next/headers";\nexport async function POST() { (await cookies()).set("theme", "dark"); return Response.json({}); }',
    });
    expect(fired).not.toContain('security/cookie-missing-httponly');
  });
});
```

## 6. Generate the documentation

```bash
npm run docs:rules
```

This writes `docs/rules/security__cookie-missing-httponly.md` from the rule's
`meta` block and updates the index. Documentation is generated from the single
source of truth, so it cannot drift — and `npm run docs:check` fails the build
if the committed pages do not match what the rules declare.

## 7. Run the gate

```bash
npm run check
```

Typecheck, lint, format, docs sync, tests, build, action bundle.

## 8. Validate against real code

This is the step that separates a rule that looks right from a rule that is
right.

```bash
npm run corpus:sync    # first time only
npm run corpus:scan
```

Look up your rule in `corpus/results/SUMMARY.md`. Then ask two questions:

**Does it fire at all?** A rule that finds nothing across 33,000 real files may
be too narrow to be worth having — or the corpus may simply not contain the
pattern, which is worth saying in the pull request.

**Does it fire too much?** Open a few matches in the cached checkout and read
them. If most are defensible code, the rule is not ready. Narrowing it now is
much cheaper than the reputational cost of shipping a noisy rule.

Every high-volume rule in this project was narrowed at least once by exactly
this process; the record is in [corpus/TRIAGE.md](../corpus/TRIAGE.md).

If that passes, open the pull request.

---

## Reference

### Rule metadata

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | `category/kebab-name`. Public contract — appears in SARIF and in user configuration. |
| `category` | yes | One of the nine. Must match the id prefix. |
| `title` | yes | Short and specific. Shown in `ai-shipcheck rules`. |
| `severity` | yes | How bad it is **if real**. |
| `confidence` | yes | How sure the analysis is. Never conflate the two. |
| `description` | yes | What goes wrong in production. Written for someone who has not met the problem before. |
| `remediation` | yes | What to type. Not "consider reviewing". |
| `references` | no | Authoritative links. First one becomes the SARIF `helpUri`. |
| `blocker` | no | Forces `NOT READY`. Only for unambiguously unsafe-to-deploy issues; requires `critical`/`high` severity and `high`/`medium` confidence. |
| `requiresFrameworks` | no | The rule is skipped as `not-applicable` when none are detected. |
| `tags` | no | Used for grouping and filtering. |

### The two source views

| Property | Comments | String bodies | Use it when |
| --- | --- | --- | --- |
| `file.code` / `file.matches()` | blanked | blanked | Default. Matching code constructs. |
| `file.text` / `file.matchesText()` | blanked | preserved | You need literal content: a header name, a URL, a table name, an import specifier. |

Both are exactly as long as `file.content`, so offsets are interchangeable.
Capture groups always come back as the real source text.

### Useful helpers

From `src/rules/helpers.ts`:

| Helper | What it does |
| --- | --- |
| `routeHandlers(file)` | Exported HTTP handlers with their body ranges, for both Next.js routers |
| `hasAuthSignal(text)` | Whether the text shows an authentication or authorisation check |
| `hasRateLimitSignal(text)` | Whether requests are throttled |
| `hasLlmCall(text)` / `findLlmCalls(file)` | LLM invocations across the major SDKs |
| `callArgumentObject(file, offset)` | Source text of a call's argument list |
| `isClientReachable(file)` | Whether a module can end up in the browser bundle |
| `isNonProductionFile(file)` | Tests, config, scripts, examples |
| `looksLikeSecretEnvName(name)` | Credential-shaped env name, excluding conventionally public ones |

From `SourceFile`:

| Method | What it does |
| --- | --- |
| `evidenceAt(offset, { length, note })` | Builds a masked, truncated evidence record. Always use this. |
| `matchBrace(offset)` | Matching `}` using the masked view |
| `functionBody(offset)` | Body of the function whose parameters start at `offset` |
| `lineAt` / `columnAt` / `lineText` | Position helpers |
| `role`, `isServer`, `isClient`, `isClientComponent` | Classification |

From `ProjectIndex` (`ctx.index`):

| Method | What it does |
| --- | --- |
| `withRole(...roles)` | Files by classification |
| `hasFramework(...ids)` / `hasDependency(...names)` | Applicability |
| `routeFiles` / `serverFiles` | Common populations |
| `file(path)` / `hasPath(path)` / `findFiles(fn)` | Lookup |
| `profile` | Detected frameworks, languages, capabilities |

### Common mistakes

**Reporting without evidence.** Every actionable finding should cite a file and
a line. Project-level rules that genuinely have no location may point at
`package.json`, but prefer a real location.

**Using `matches` when you need `matchesText`.** If your pattern contains a
string literal's *contents*, it will never match the default view. This is the
most common reason a new rule silently does nothing.

**Conflating severity and confidence.** A heuristic finding is still `high`
severity if the underlying problem is severe. Lower the confidence instead —
the scoring model already weights it down.

**Forgetting the applicability gate.** If a rule cannot apply, say so with
`appliesTo` or `markUnassessed`. Silently passing inflates the score.

**Regex that can backtrack.** Bound your quantifiers (`{0,200}`), avoid nested
repetition, and remember the input is untrusted.

**Fixing a false positive by widening an exclusion until the rule stops
working.** Narrow the match instead.
