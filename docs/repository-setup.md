# Repository Setup

This repository uses GitHub Actions for CI and npm publishing, plus an
explicit branch protection payload for `main`.

## Branch protection for `main`

Desired rules live in `.github/branch-protection/main.json`:

- require the `CI / verify` status check
- require pull requests before merging
- require 1 approval
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

## npm publish workflow

`.github/workflows/publish.yml` runs when a GitHub release is published.

It:

- installs dependencies
- validates that the release tag matches `package.json` version
- rebuilds and reruns checks
- publishes to npm using trusted publishing (OIDC)

No `NPM_TOKEN` repository secret is required.

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

## Recommended release flow

1. Bump `package.json` version in a pull request.
2. Merge into `main` after `CI / verify` passes and review is approved.
3. Create a GitHub release tagged `v<version>`.
4. Let `Publish to npm` publish that exact version to npm.
