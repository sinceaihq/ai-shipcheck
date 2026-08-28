AI Shipcheck tells you whether a JavaScript or TypeScript project is ready to
deploy, with evidence for every finding. It runs locally: no signup, no API
key, and nothing from the scanned repository is executed or uploaded.

```bash
npx ai-shipcheck .
```

```yaml
- uses: sinceaihq/ai-shipcheck@v1
  with:
    fail-on: critical
    min-score: 80
```

See the [changelog](https://github.com/sinceaihq/ai-shipcheck/blob/main/CHANGELOG.md)
for everything in this release, and
[corpus/TRIAGE.md](https://github.com/sinceaihq/ai-shipcheck/blob/main/corpus/TRIAGE.md)
for how the rules were validated against twenty real public repositories.

This is static analysis of source code. It is not a security certification, and
a clean report means the checks it knows how to make found nothing — not that
the code is correct. The
[limitations](https://github.com/sinceaihq/ai-shipcheck/blob/main/docs/LIMITATIONS.md)
are documented.
