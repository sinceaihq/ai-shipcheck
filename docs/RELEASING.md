# Releasing

AI Shipcheck publishes through **npm Trusted Publishing**: the release workflow
authenticates with a short-lived OIDC token minted by GitHub for that single
job. There is no npm token in the repository, in a GitHub secret, or on
anyone's laptop — so there is nothing to leak, rotate, or accidentally print.

## The npm side, and who controls it

This is already configured — the section is here so it can be verified or
rebuilt, not performed.

Trusted publishing is configured on the package page at npmjs.com under
**Settings → Trusted Publisher → GitHub Actions**, with exactly these values.
All four must match or the publish is rejected:

| Field | Value |
| --- | --- |
| Organization or user | `sinceaihq` |
| Repository | `ai-shipcheck` |
| Workflow filename | `release.yml` |
| Environment | `release` |

The matching `release` environment exists in this repository under
**Settings → Environments**. Adding required reviewers to it is recommended:
it makes a publish need a human approval click rather than only a workflow run.

**Do not create an npm automation token.** A token would publish from anywhere
that holds it; the OIDC exchange only grants publish rights to this repository,
this workflow file and this environment. If a publish fails to authenticate,
the fix is in the four values above — never a token.

### Ownership, and the one thing a maintainer cannot do alone

**Releasing needs no npm credential.** Any maintainer who can dispatch
`release.yml` can cut a release; the workflow authenticates as itself.

But the npm package currently has a **single owner**, and these actions are
possible only for that account:

- changing or re-adding the trusted publisher configuration
- adding or removing package owners
- deprecating or unpublishing a version

If that account becomes unavailable, releases continue to work — but none of
the above can be done, and a broken trusted-publisher configuration would
strand the project. Two ways to remove the dependency, in order of preference:

1. **Move the package to an npm organisation** and grant the team publish
   rights, so ownership is a group rather than a person.
2. **Add a second owner** (`npm owner add <user> ai-shipcheck`).

Until one of those is done, this is the project's only genuine single point of
failure. It is recorded here rather than left as something the original
maintainer happens to know.

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
