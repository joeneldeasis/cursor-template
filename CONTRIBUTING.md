# Contributing

## Setup

Node.js 20 or newer is required. CI tests Node.js 20, 22, and 24.

```bash
npm ci
npm run validate
```

`npm run validate` lints, typechecks, builds, tests, and writes a coverage report. `npm run ci` also checks the packed tarball and runs it with npx from a clean temporary directory.

Use `npm run lint:fix` locally when ESLint can fix a finding. CI runs `npm run lint` and does not auto-fix.

## Pull requests

Open a pull request against `main`. The pull request template lists the checks to complete. GitHub Actions runs CI, CodeQL, dependency review, and `npm audit`.

## Branch protection

On the primary branch, configure:

- Require a pull request before merging
- Require status checks to pass
- Require branches to be up to date before merging
- Require conversation resolution
- Block force pushes
- Block branch deletion

Require these status checks:

- `CI / Required`
- `Security / Audit`
- `Security / Dependency review`
- `CodeQL / Analyze`

`CI / Required` passes only when every Node.js version and operating-system job succeeds.

## Releases

Publishing does not happen on every merge. Push a tag that matches `package.json`:

```text
v0.1.0
```

The release workflow installs with `npm ci`, runs `npm run ci`, publishes with `npm publish --provenance`, and opens a GitHub Release for that tag.

Before the first publish, connect this package on npm to trusted publishing for this repository and the `Release` workflow (`release.yml`). The workflow requests `id-token: write` only on the publish job and does not read a long-lived npm token.
