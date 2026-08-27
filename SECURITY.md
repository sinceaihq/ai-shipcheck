# Security Policy

## Reporting a vulnerability

Please report security issues privately, not as a public issue.

Use GitHub's private reporting:
**[Report a vulnerability](https://github.com/sinceaihq/ai-shipcheck/security/advisories/new)**

Or email **security@sinceai.ai**.

Please include:

- What the problem is, and what an attacker gains from it
- A minimal reproduction (a repository layout is usually enough)
- The AI Shipcheck version and your Node version

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | Within 3 business days |
| Initial assessment | Within 7 business days |
| Fix or mitigation for a confirmed high-severity issue | Within 30 days |

We will keep you updated as the assessment progresses, credit you in the
advisory unless you would rather we did not, and coordinate disclosure timing
with you.

## What counts as a vulnerability in AI Shipcheck

AI Shipcheck is a static analysis tool that people point at repositories they
do not necessarily trust. The following are in scope:

- **Escaping the scan root.** Any input — a symlink, a crafted path, an ignore
  file — that causes Shipcheck to read a file outside the directory it was
  pointed at.
- **Executing target code.** Any input that causes code from the scanned
  repository to be executed, imported, evaluated, or resolved as a module.
  Shipcheck must never do this.
- **Leaking a secret.** Any path where a discovered credential reaches an
  output unmasked — terminal, JSON, SARIF, Markdown, GitHub annotation, or
  job summary.
- **Denial of service.** Any input that causes a scan not to terminate:
  catastrophic backtracking in a regular expression, an unbounded loop, or
  unbounded memory growth. All scans must complete or stop cleanly at a
  documented limit.
- **Output injection.** Any input — a filename, a code snippet — that breaks
  out of its context in SARIF, Markdown, or a GitHub workflow command.
- **Supply-chain integrity.** Problems with the published package or the
  bundled GitHub Action.

## What does not count

- **A missed finding.** A false negative is a bug, not a vulnerability. Please
  file it as an [issue](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_negative.yml).
- **A wrong finding.** A false positive is also a bug, and a high-priority one,
  but not a vulnerability. Use the [false positive template](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_positive.yml).
- **Vulnerabilities in the code you scanned.** Those are yours to fix.
- **A clean report on insecure code.** Shipcheck reports what it can establish
  statically; a passing scan is not a security certification, and this is
  stated in every report.

## Design commitments

These properties are enforced by tests, and breaking one is a release blocker:

1. Nothing in a scanned repository is executed, imported, evaluated, or
   resolved. Files are read as bytes.
2. No network request is made during a scan. There is no telemetry.
3. Symlinks resolving outside the scan root are refused; symlink loops
   terminate.
4. Every value that reaches an output passes through the masking layer.
5. Every regular expression is linear-time on adversarial input; the lexer is
   single-pass.
6. File size, file count, total bytes and directory depth are bounded, and the
   report says when a limit truncated the scan.

The reasoning behind each is in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Supported versions

While the project is pre-1.0, security fixes are released against the latest
minor version only.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
