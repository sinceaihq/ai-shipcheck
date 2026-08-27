# Roadmap

What is planned, what is deliberately not, and roughly in what order. Dates are
intentionally absent; sequence is what matters.

Issues tagged [`roadmap`](https://github.com/sinceaihq/ai-shipcheck/labels/roadmap)
track individual items. If something here matters to you, say so on the issue —
that is the main input into ordering.

## Shipped (1.0)

- 63 rules across nine production-readiness categories
- Dependency-free JS/TS/JSX lexical analysis
- Framework detection across every manifest in the tree, so monorepos work
- Transparent, documented, unit-tested scoring with blockers and explicit
  assessment coverage
- `pretty`, `json`, `markdown` and SARIF 2.1.0 output
- Bundled GitHub Action with inline annotations and job summaries
- Optional configuration, `.gitignore` awareness, bounded scans
- A reproducible 20-repository validation corpus with a published triage record
- Clean-room package verification with the registry made unreachable

## Next

**Express and Fastify auth coverage.** The largest known gap: the auth rules
understand Next.js route conventions only, so an Express application gets no
"this route writes without an authorisation check" finding. Doing this well
means recognising router-level and app-level middleware, which is why it did
not make v1.

**Keep widening the corpus.** Twenty repositories found a lexer bug and cut
findings in half. Forty will find more. This is the highest-value ongoing work
in the project, and it is where new contributors can help most.

**Baseline files.** `--baseline shipcheck-baseline.json` to record existing
findings and report only new ones, so the tool is adoptable in a large existing
codebase without a cleanup sprint first.

**Diff-aware scanning.** `--since <ref>` to report only findings in changed
files, which is what most pull-request workflows actually want.

**Autofix for the mechanical rules.** `--fix` for the small set where the
correct change is unambiguous: adding `alt=""` to a decorative image, adding
`take` to an unbounded query, adding `AbortSignal.timeout` to a fetch. Only
where the fix cannot be wrong.

**Better cross-file reasoning.** Following a shared `requireUser` helper across
module boundaries would let the auth rules be both stricter and quieter. This
needs a real import graph, which the current index does not build.

## Later

**More frameworks.** SvelteKit, Nuxt, Astro and Remix are detected but have few
framework-specific rules. Hono and NestJS likewise. Each needs someone who
actually ships on it.

**Language adapters.** The engine is deliberately language-agnostic below the
rule layer: the walker, the index, scoring and the reporters do not know what
JavaScript is. Adding Python or Go means a new lexer and a new rule set, not a
redesign. Python (Django, FastAPI) is the most requested.

**Editor integration.** An LSP or a VS Code extension surfacing findings inline
while writing, rather than after the fact.

**Rule plugins.** A documented way to load rules from a package, so an
organisation can keep private checks alongside the built-in ones. The `Rule`
interface is already the whole contract; what is missing is safe loading and a
compatibility policy.

**Historical tracking.** Score over time, so a team can see whether readiness
is improving. This must stay local — a hosted service is explicitly not planned.

## Not planned

- **A hosted service or dashboard.** Local-first is the point.
- **Requiring an API key or a login.** Ever.
- **Uploading source code anywhere.**
- **Executing or installing the code being scanned.** Several checks would be
  easier with a runtime. They are not worth it.
- **Calling an LLM as part of a scan.** The core stays deterministic: the same
  input produces the same report, offline, with citable evidence. An optional
  opt-in layer that explains findings is a reasonable future addition, but it
  will never be required and will never affect the score.
- **A rule count race.** Rules that exist to make a number bigger make the tool
  worse.

## Versioning commitments

Rule ids and the JSON `schemaVersion` are public contract. Before 1.0, breaking
changes to either are possible but will be called out in
[CHANGELOG.md](CHANGELOG.md). After 1.0 they follow semantic versioning.

Scoring constants may change in a minor version — the model is documented and
tested precisely so that such a change is visible rather than silent.
