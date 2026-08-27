# Limitations

What AI Shipcheck cannot tell you. Reading this is the difference between using
the tool well and trusting it too much.

## The headline

**A clean report is not a certification.** It means the checks Shipcheck knows
how to make found nothing. It does not mean the code is correct, or secure, or
ready.

## Structural limits

### It only sees source code

Shipcheck reads the files in a directory. It cannot see:

- Database settings — a Supabase table might have RLS enabled in the dashboard
  with no migration recording it. Shipcheck reports that as **unassessed**, not
  as safe.
- Environment variables at deploy time, secrets managers, or platform
  configuration.
- Reverse proxies, WAFs, rate limiting at the CDN or gateway layer.
- Runtime behaviour of any kind.

Many production-readiness properties live in those layers. Shipcheck is one
input, not the whole picture.

### It never runs anything

By design, nothing from the scanned repository is executed, imported or
resolved. That rules out a class of checks that would otherwise be easy — for
example, resolving what a configuration file actually evaluates to. Where a
config computes its values dynamically, Shipcheck may report `unassessed`
rather than guess.

### It is lexical, not semantic

The analysis is token-based, not a full parse with type information. In
practice that means:

- **No cross-file reasoning.** If your auth check lives in a helper in another
  module and the route calls it through an alias Shipcheck does not recognise,
  the auth rule may report a false positive. The signal lists are deliberately
  generous to make this rare.
- **No dataflow analysis.** The SSRF rule follows a value one hop — from a
  `const` assignment to an interpolation in the same module. Two hops, or
  through a function, and it will not see it.
- **No type information.** A rule cannot know that a variable is a `Request`.

### Deliberate lexer trade-offs

These are documented in the lexer and each bounds a mis-tokenisation to a
single line:

| Input | Behaviour | Consequence |
| --- | --- | --- |
| A quote that never closes on its line | Treated as a plain character | An apostrophe in JSX text (`It's fine`) behaves sensibly; the rest of that one line is scanned as code |
| `/` immediately after `<` | Always division, never a regex | JSX closing tags cannot start a bogus regex; the vanishingly rare `a </b/` is mis-read |
| A regex literal not closing on its line | Treated as division | A regex containing an escaped newline is mis-read |
| An unterminated template literal | Blanked to end of file | Suppresses findings in the remainder rather than inventing them |

Shipcheck fails toward silence. A malformed file produces fewer findings, not
wrong ones.

## Coverage limits

### Language

v1 covers JavaScript and TypeScript, including JSX. Python, Go, Rust, Ruby,
Java and PHP are not analysed. Files in those languages are walked but not
inspected, and no rule claims otherwise.

The engine is language-agnostic below the rule layer — see
[ARCHITECTURE.md](ARCHITECTURE.md#adding-a-language-later) — so this is a matter
of work, not redesign.

### Frameworks

Framework-specific rules only run when the framework is detected. Next.js is
covered most thoroughly, followed by Express, Supabase and Prisma. SvelteKit,
Nuxt, Astro, Remix, Hono and NestJS are detected but have few dedicated rules —
their generic security, reliability and accessibility checks still apply.

**Express and Fastify route handlers are not covered by the auth rules.** Those
rules currently understand Next.js route conventions. An Express app will be
checked for everything else but will not get a "this route writes without an
auth check" finding.

### Rules are not exhaustive within a category

"Security: 100" means no security rule fired. It does not mean the code is
secure. There is no rule for business-logic flaws, race conditions,
authorisation modelling errors, or anything else that requires understanding
what the application is meant to do.

## Known false-positive sources

Reported when they occur, and each fix ships with a regression test. The
current known sources:

- **Custom auth wrappers.** A house-style `withGuard(handler)` that Shipcheck's
  signal list does not recognise will produce an "unprotected route" finding.
- **Framework-provided pagination.** A query bounded by a library rather than
  an explicit `take`/`limit` may be reported as unbounded.
- **Generated code that is not detected as generated.** Detection is based on
  average line length and directory naming; generated code formatted like
  handwritten code will be analysed as handwritten.
- **Monorepos.** A scan of the repository root sees all packages at once.
  Framework detection is union-based, so a rule requiring Next.js may run
  against a package that has nothing to do with it. Scanning each package
  separately gives better results today.

If you hit one of these, please
[report it](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_positive.yml).

## Known false-negative sources

- **Obfuscated or minified code.** Files with very long average lines are
  skipped as generated.
- **Very large files.** Files over 1 MiB or 20,000 lines are skipped; the
  report says how many.
- **Truncated scans.** If a limit is hit, the report says so — but the findings
  it did produce are necessarily incomplete.
- **Dynamic construction.** A route registered from a computed string, a query
  built by a helper, a model name assembled at runtime.

## Scoring limits

The score summarises how many of *these specific checks* found something. It is
not comparable across projects of different shapes: a static site with three
assessable categories and a Next.js app with nine are not measured on the same
scale, even though both produce a number out of 100.

Use the score to track one project over time, not to rank projects against each
other.

## What to do about all this

- Treat findings as leads, not verdicts. Every one cites a file and a line so
  you can judge it yourself.
- Treat a clean report as "these checks passed", not "this is fine".
- Read the **not assessed** section. It is the honest part of the report.
- Keep doing code review, dependency scanning, penetration testing and
  monitoring. Shipcheck is one layer.
