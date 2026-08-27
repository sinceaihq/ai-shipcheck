# Fixtures

Small, synthetic projects used to test the rule engine end to end.

- `vulnerable-*` projects are **intentionally insecure**. They exist so that
  every rule has a positive fixture. Nothing in them is deployed, imported by
  the tool, or executed at any point — Shipcheck only ever reads files as text.
- `secure-*` projects are the negative fixtures. `tests/integration/fixtures.test.ts`
  asserts that no rule fires on them, which is what keeps the false-positive
  rate honest as rules are added.

**Every credential in these fixtures is fabricated.** The values are shaped
like real provider keys because that is what the detectors match on, but they
are literal strings such as `SHIPCHECKFIXTURE` padded to the right length. None
of them has ever been valid.

Do not copy code from a `vulnerable-*` fixture into a real project.
