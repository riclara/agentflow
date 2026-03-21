# Repository Setup

This repository uses GitHub Actions for CI, automatic versioning, npm trusted
publishing, plus an explicit branch protection payload for `main`.

## Branch protection for `main`

Desired rules live in `.github/branch-protection/main.json`:

- require the GitHub Actions check run `verify`
- require pull requests before merging
- require 0 approvals (single-maintainer setup)
- dismiss stale reviews
- require conversation resolution
- require linear history
- block force pushes
- block branch deletion
- enforce rules for admins

To apply the rule with GitHub CLI:

```bash
gh auth login -h github.com
./scripts/apply-branch-protection.sh
```

The authenticated GitHub token must have repository administration write
permissions.

## CI workflow

`.github/workflows/ci.yml` runs on:

- pushes to `main`
- pull requests targeting `main`

It executes:

- `npm ci`
- `npm run build`
- `npm run typecheck`
- `npm test`

## Release workflow

`.github/workflows/publish.yml` runs on every push to `main` and also supports
manual recovery via `workflow_dispatch`.

It:

- runs `release-please` against the manifest config
- opens or updates a release PR when there are releasable commits
- creates a GitHub release and tag when the release PR is merged
- rebuilds, reruns checks, and publishes to npm in the same workflow when a
  new release is created
- can manually publish an existing release/tag if the publish step failed after
  the release was already created

No `NPM_TOKEN` repository secret is required.

Recommended repository secret:

- `RELEASE_PLEASE_TOKEN_AGENTFLOW`: fine-grained GitHub token with repository
  access so release PRs trigger CI checks under the current branch protection
  rules. If it is absent, the workflow falls back to `GITHUB_TOKEN`, but
  release PRs may not trigger `CI / verify`.

Configure trusted publishing in npm:

1. Go to `npmjs.com` → package `@riclara/agentflow` → `Settings` → `Trusted publishing`.
2. Add a GitHub Actions trusted publisher with:
   - Organization or user: `riclara`
   - Repository: `agentflow`
   - Workflow filename: `publish.yml`
   - Environment name: leave empty unless you later protect publishing with a GitHub environment
3. After the first successful trusted publish, go to `Settings` → `Publishing access`.
4. Select `Require two-factor authentication and disallow tokens`.

Workflow requirements:

- GitHub-hosted runner
- `id-token: write` permission
- Node.js `24.x`
- npm CLI `11.5.1` or later

Manual recovery flow:

1. Open the `Release` workflow in GitHub Actions.
2. Click `Run workflow`.
3. Set `ref` to the existing release tag, for example `agentflow-v1.0.2`.
4. Run the workflow to retry only the publish path against that tag.

Package metadata requirements:

- `name` stays `@riclara/agentflow`
- `repository` must point to the source repository, not the npm package name
- keep `repository.url` as `git+https://github.com/riclara/agentflow.git`

Release-please configuration files:

- `.github/release-please-config.json`
- `.github/.release-please-manifest.json`

Versioning rules:

- `fix:` bumps patch
- `feat:` bumps minor
- `feat!:` / `fix!:` / any commit with a breaking change bumps major
- `chore:`, `docs:`, `ci:`, and similar non-releasable commits do not open a
  release PR by themselves
- `Release-As: x.y.z` in a commit body forces the next release version

## Recommended release flow

1. Merge conventional commits into `main`.
2. Let `release-please` open or update the release PR automatically.
3. Review and merge the release PR once `CI / verify` passes.
4. Let the same workflow create the GitHub release, create the release tag,
   and publish to npm automatically.
