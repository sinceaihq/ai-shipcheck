# Trust model

What AI Shipcheck does with your code, what it will not do, how it is
validated, and how fast it is. The security analysis behind these
guarantees is in [THREAT_MODEL.md](THREAT_MODEL.md).

## Local-first by construction

Shipcheck is a local tool with a deliberately small blast radius:

- **Nothing leaves your machine.** No telemetry, no network calls, no upload.
- **Nothing from the scanned repository is executed.** No `import`, no `eval`,
  no install scripts, no package resolution. Files are read as bytes and
  analysed lexically.
- **Secrets are masked** everywhere they could be printed — terminal, JSON,
  SARIF, Markdown, and the GitHub job summary alike.
- **Scans are bounded.** File size, file count, total bytes and directory depth
  are all capped; symlink loops terminate; symlinks pointing outside the scan
  root are refused. When a limit truncates a scan, the report says so.
- **One runtime dependency.** A tool that inspects other people's supply chains
  should have almost none of its own.

The full analysis is in **[docs/THREAT_MODEL.md](THREAT_MODEL.md)**.

## How the rules are validated

Fixtures written alongside a rule agree with that rule by construction. To find
out whether the rules are actually precise, Shipcheck is run against **20 real
public repositories** pinned by commit SHA — Next.js apps, Express and Fastify
services, ORMs, AI applications, and large monorepos.

Every rule that fired was triaged against the real code. That process cut total
findings from 5,710 to 2,819 — a **51% reduction**, none of it from suppressing
repositories by name — and found a lexer bug that had been reporting wrong line
numbers in any file containing a multi-line comment.

Each fix has a regression test named after the repository it came from.

- [corpus/TRIAGE.md](../corpus/TRIAGE.md) — the verdict on every rule that fired
- [corpus/results/SUMMARY.md](../corpus/results/SUMMARY.md) — per-repository results
- `npm run corpus:sync && npm run corpus:scan` — reproduce it

## Performance

Scanning 20 real repositories — 33,437 files, 137 MB — takes 18 seconds in
total on an Apple M-series laptop: roughly **1,800 files per second**. The
largest, `payloadcms/payload` at 7,542 files, scans in 3.9 seconds.

Reproduce with `npm run corpus:scan`, or benchmark your own project with
`npm run bench -- <path>`. Numbers vary with hardware and file size; there are
no timing assertions in CI, because hardware-dependent thresholds produce flaky
builds.

---

See also: [limitations](LIMITATIONS.md), [threat model](THREAT_MODEL.md),
[scoring](SCORING.md), [corpus triage](../corpus/TRIAGE.md).
