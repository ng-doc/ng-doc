# Releasing

NgDoc releases its seven packages (`@ng-doc/add`, `app`, `builder`, `core`, `keywords-loaders`, `ui-kit`, `utils`) together, with one version, through Nx Release and the **📦 Release** workflow (`.github/workflows/release.yml`). Only maintainers release. Agents never start a release, push a release tag or publish; they may run the local dry runs below.

## The rules

- **The version is set by hand.** The workflow takes the exact version to publish. Commits never choose it: their types only shape the release notes (see **Commits** in [code-style.md](code-style.md)).
- **One fixed group.** `release` in `nx.json` lists the seven projects with `projectsRelationship: fixed`, so every package gets the same version, and the release tag is `v{version}`.
- **No release commit.** Versions are written only into the built manifests in `dist/libs/*` (`manifestRootsToUpdate: ["dist/{projectRoot}"]`). `libs/*/package.json` keep their placeholder versions, and the repository never receives a release commit, so a release never pushes to a protected branch. The release tag points at the released commit.
- **Branches and dist-tags** (checked by `tools/scripts/release-plan.mjs` before anything is built):

  | Run from            | Version             | npm dist-tag  | Deploys ng-doc.com |
  | ------------------- | ------------------- | ------------- | ------------------ |
  | `main`              | `X.Y.Z`             | `latest`      | yes                |
  | `main`              | `X.Y.Z-beta.N`      | `beta`        | no                 |
  | `N.x` (maintenance) | `N.Y.Z` (major `N`) | `release-N.x` | no                 |

  Anything else is refused with the reason: a tag or another branch, a version that is not `X.Y.Z` or `X.Y.Z-beta.N`, a version whose `v` tag exists, a stable version on `main` that is not newer than the newest stable release, or a maintenance version that is not newer than the newest release of its line. A dist-tag can't be `N.x` because npm refuses a dist-tag that is a valid semver range.

## What the workflow does

1. **Plan:** `release-plan.mjs` checks the inputs against the rules above and outputs the dist-tag and whether to deploy.
2. **Build:** every `type:lib` project, without the Nx cache. For a stable release from `main` it also builds ng-doc.com with the Vite engine.
3. **Version:** `nx release version <version>` writes the version into `dist/libs/*/package.json` and pins the packages' dependencies on each other to it. Nx follows the project graph for this, which comes from imports, so a package that depends on another one without importing it declares the dependency in `implicitDependencies` (`@ng-doc/add` on `@ng-doc/builder`); `tools/scripts/testing/release-manifests.test.mjs` keeps every such dependency a graph edge. `tools/scripts/release-manifests.mjs` then copies the shared metadata of the root `package.json` (`keywords`, `author`, `repository`, `bugs`, `homepage`, `license`) into each manifest.
4. **Show:** `npm pack --dry-run` lists every tarball's files and size.
5. **Publish:** `nx release publish --tag <dist-tag>` runs `pnpm publish` for each package, dependencies first. It uses npm trusted publishing (OIDC: `id-token: write`, no token or secret), and pnpm attaches a provenance attestation under trusted publishing. Each package's trusted publisher on npmjs.com names this repository and `release.yml`, so renaming the workflow breaks publishing.
6. **Tag and notes:** `nx release changelog <version>` creates the annotated tag `v<version>`, pushes it, and creates the GitHub release. Its notes are generated from the Conventional Commits since the previous release tag (Nx looks for it on the current branch first, then on all branches). There is no `CHANGELOG.md` file. This step runs after publishing, so a failed publish leaves no tag.
7. **Deploy:** after a stable release from `main`, `deploy.yml` (called with the `site` artifact) syncs `dist/apps/ng-doc/browser` to ng-doc.com.

## Running a release

1. Merge everything for the release into `main` (or the maintenance branch) and wait for its checks.
2. Run **📦 Release** from the Actions tab on that branch, with `version` and `dry-run` on (the default). Read the plan line, the tarball list (every package, the expected files), the publish dry run and the release notes it prints.
3. Run it again with the same version and `dry-run` off.

From a terminal: `gh workflow run release.yml --ref main -f version=22.2.0 -f dry-run=true`.

- **Betas:** release `X.Y.Z-beta.N` from `main`, then `X.Y.Z` when it is ready. `latest` never moves for a beta.
- **Maintenance:** cut `N.x` from the last `vN.*` tag only when an older line needs a fix (`git switch -c N.x vN.Y.Z`), put the fixes there through pull requests, and release `N.Y.Z+1` from it. Cut it from a tag that already carries this workflow (22.2.0 or later).
- **Recovery:** if a run fails before the tag step, run it again with the same version: `nx release publish` skips a package whose version is already published. If it failed after publishing but before the tag, the same re-run creates the tag and the release. Never publish a version by hand.

## Previewing locally

After building the packages (`pnpm nx run-many -t build --projects=tag:type:lib`):

```sh
pnpm nx release version 22.2.0 --dry-run     # the versions and dependency pins it would write
pnpm nx release changelog 22.2.0 --dry-run   # the release notes and the tag
node tools/scripts/release-plan.mjs          # with VERSION=22.2.0 BRANCH=main REF_TYPE=branch
```

Never run `nx release version`, `changelog` or `publish` without `--dry-run` in the shared checkout: `version` rewrites the shared `dist`, and `changelog` creates and pushes a tag. A full local rehearsal belongs in a scratch copy with its own `dist` (see [agent-safety.md](agent-safety.md)).

## Changing the release

- Keep the release group, `release-plan.mjs`, `release.yml` and this file in step, and update `tools/scripts/testing/release-plan.test.mjs` and `release-manifests.test.mjs` with them.
- A new published package goes into `release.projects` in `nx.json`, `RELEASE_PACKAGES` in `release-manifests.mjs`, the tarball loop of `release.yml`, and npm's trusted publishers.
- Run a dry run of the workflow before relying on a change.
