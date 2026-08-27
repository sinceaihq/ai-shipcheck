# Releasing

AI Shipcheck publishes through **npm Trusted Publishing**: the release workflow
authenticates with a short-lived OIDC token minted by GitHub for that single
job. There is no npm token in the repository, in a GitHub secret, or on
anyone's laptop — so there is nothing to leak, rotate, or accidentally print.

## One-time setup on npmjs.com

This is the only step that cannot be done from this repository, because it
configures the npm account rather than the code.

1. Sign in at **[npmjs.com](https://www.npmjs.com/)** as a user who will own
   the `ai-shipcheck` package.
2. The package does not exist yet, so the first publish must establish it.
   Either:
   - publish `1.0.0` once manually (`npm publish --access public`) and then
     configure trusted publishing, **or**
   - create the package placeholder and configure trusted publishing first.

   The second is preferable: it means no version is ever published from a
   laptop.
3. Go to the package page → **Settings** → **Trusted Publisher** → *GitHub
   Actions*, and enter exactly:

   | Field | Value |
   | --- | --- |
   | Organization or user | `sinceaihq` |
   | Repository | `ai-shipcheck` |
   | Workflow filename | `release.yml` |
   | Environment | `release` |

4. In this repository, go to **Settings → Environments → New environment** and
   create one named **`release`**. Adding required reviewers there is
   recommended: it means a publish needs a human approval click, not just a
   workflow run.

Nothing else is needed. Do not create an npm automation token.

## Cutting a release

1. **Update the version in two places** — they are checked against each other
   by the workflow:
   - `package.json` → `version`
   - `src/version.ts` → `VERSION`

2. **Write the changelog entry.** The workflow refuses to publish without a
   `## [x.y.z]` section in `CHANGELOG.md`.

3. **Run the gate locally.**

   ```bash
   npm run check
   npm run verify:package
   ```

4. **Re-validate against real code** if any rule changed:

   ```bash
   npm run corpus:sync
   npm run corpus:scan
   ```

   Review `corpus/results/SUMMARY.md` for unexpected movement and update
   `corpus/TRIAGE.md` if a rule's behaviour changed.

5. **Commit and push to `main`.** Wait for CI, Package integrity, Action
   self-test and Self scan to go green.

6. **Dry run the release workflow.** Actions → *Release* → *Run workflow*,
   enter the version, leave **dry-run** ticked. This runs every check and packs
   the tarball without publishing.

7. **Release for real.** Run it again with **dry-run** unticked. If the
   `release` environment has reviewers, approve the deployment.

The workflow then publishes to npm with provenance, creates the `vX.Y.Z` tag,
moves the `vX` major tag, and opens the GitHub release.

## Tagging strategy

| Tag | Meaning |
| --- | --- |
| `v1.0.0` | Immutable. Points at exactly one commit, forever. |
| `v1` | Moving. Always the newest `1.x.y`. This is what the Action documentation tells people to use. |

The moving major tag is what makes `uses: sinceaihq/ai-shipcheck@v1` keep
working across patch releases. It is force-pushed by the release workflow, which
is the accepted convention for GitHub Actions.

Users who want byte-for-byte reproducibility should pin a commit SHA; this is
recommended in `docs/github-action.md`.

## Versioning policy

Two things beyond the code are public contract:

- **Rule ids.** They appear in user configuration and in SARIF. Renaming or
  removing one is a breaking change.
- **The JSON schema**, reported as `schemaVersion` in every JSON report.
  Changing its shape bumps that version and is listed in the changelog.

| Change | Version bump |
| --- | --- |
| New rule | Minor |
| Rule narrowed to reduce false positives | Minor |
| Rule severity, confidence or blocker status changed | Minor, called out in the changelog |
| Rule removed or renamed | Major |
| Scoring constants changed | Minor, called out in the changelog |
| JSON schema field added | Minor |
| JSON schema field removed or retyped | Major, with a `schemaVersion` bump |
| CLI flag removed, or an exit code changed | Major |

Scoring constants may move in a minor release. They are documented and unit
tested precisely so that such a change is visible in a diff rather than silent.

## Publishing checklist

- [ ] `package.json` and `src/version.ts` agree
- [ ] `CHANGELOG.md` has an entry for the version
- [ ] `npm run check` passes
- [ ] `npm run verify:package` passes
- [ ] `action/dist` rebuilt and committed if any source changed
- [ ] Corpus re-scanned if any rule changed, and `TRIAGE.md` updated
- [ ] All required workflows green on `main`
- [ ] Release workflow dry run succeeded
