# Validation corpus

AI Shipcheck is validated against real public repositories, not only against
the fixtures in `fixtures/`. Fixtures agree with the rules that produced them
by construction; only code written by people who have never heard of this tool
tells you whether a rule is actually precise.

## What is here

- `corpus.json` — the repository list with **pinned commit SHAs**.
- `results/SUMMARY.md` — the committed summary, including per-rule totals.
- `results/latest.json` — the full machine-readable result. **Not committed**:
  it is about a megabyte and regenerates byte-for-byte from the pinned commits,
  so keeping it in history would be churn without evidence value.
- `TRIAGE.md` — the verdict on every rule that fired, and what was done about it.

## What is not here

The repositories themselves. They are cloned into a cache directory **outside**
this repository (`~/.cache/ai-shipcheck-corpus` by default, override with
`SHIPCHECK_CORPUS_DIR`), so third-party source can never be staged, packed or
published by accident.

## Running it

```bash
npm run build
npm run corpus:sync     # clone/checkout every repository at its pinned commit
npm run corpus:scan     # scan them and write results/
npm run corpus:report   # print the summary
```

To move the corpus forward to current upstream HEADs:

```bash
npm run corpus:sync -- --pin
```

That rewrites the `commit` fields in `corpus.json`. Commit the result so the
next run is reproducible, and re-triage anything that changed.

## Safety

The harness clones with `git` invoked through an explicit argument array and no
shell. Nothing in a cloned repository is installed, executed or imported —
Shipcheck reads the files as text, exactly as it does for any other target.
