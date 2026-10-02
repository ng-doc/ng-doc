# Contributing to NgDoc

Thank you for wanting to make NgDoc better! 🎉 Every kind of help counts:

- **Report a bug or ask for a feature.** Open an issue in the
  [issue tracker](https://github.com/ng-doc/ng-doc/issues/new/choose). Search the
  [existing issues](https://github.com/ng-doc/ng-doc/issues) first, and for a bug include the NgDoc
  and Angular versions and the steps to reproduce it.
- **Improve the documentation.** The guides on [ng-doc.com](https://ng-doc.com/) live in this
  repository under `apps/ng-doc/docs`, so a typo fix is a small pull request.
- **Fix a bug or build a feature.** For anything larger than a small fix, open or comment on an
  issue first, so we can agree on the approach before you spend time on it.

Everyone taking part agrees to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Contents

- [Prerequisites](#prerequisites)
- [Getting started](#-getting-started)
- [Repository map](#repository-map)
- [The two engines](#the-two-engines)
- [Making a change](#-making-a-change)
- [Commits](#commits)
- [Pull requests](#-pull-requests)
- [Releases](#releases)
- [Getting help](#-getting-help)

## Prerequisites

- **Node.js 24**, version `>=24.15.0 <25`. NgDoc's builder requires it, and CI uses 24.19.0.
- **npm**, which comes with Node. The repository uses the committed `package-lock.json`.
- **Git.**
- **Linux, macOS or Windows.** CI runs on Linux and Windows. A few generator test groups need POSIX
  process groups and run on Linux and macOS only (see [Generator](#generator)).
- **Optional:** Python 3, which the `progress` test group uses for its pseudo-terminal checks.

## 🚀 Getting started

1. Fork [ng-doc/ng-doc](https://github.com/ng-doc/ng-doc) on GitHub, then clone your fork and create
   a branch from `main`:

   ```bash
   git clone https://github.com/<your-username>/ng-doc.git
   cd ng-doc
   git checkout -b fix/my-change
   ```

2. Install the dependencies from the lockfile. This also installs the Git hooks.

   ```bash
   npm ci
   ```

3. Build the packages into `dist/libs`:

   ```bash
   npx nx run-many --target=build --projects=core,utils,ui-kit,keywords-loaders,builder,app --parallel=1
   ```

4. Link the built packages into `node_modules/@ng-doc/*`, so the docs site uses your local build:

   ```bash
   npx nx run ng-doc:link-libs
   ```

5. Run the documentation site with the new engine, then open the URL it prints:

   ```bash
   npx nx run ng-doc:serve-vite
   ```

The documentation site in `apps/ng-doc` is NgDoc's own site, [ng-doc.com](https://ng-doc.com/),
built with NgDoc, so it is also the best place to try your change. The `serve-vite` target builds
and links the packages first through its task dependencies, so steps 3 and 4 also run when you skip
them. The site loads the packages from `dist`, so rebuild after you change library code.

> **Tip:** in scripts and non-interactive shells, run Nx with
> `NX_DAEMON=false NX_NO_CLOUD=true NX_TUI=false`.

## Repository map

This is an [Nx](https://nx.dev/) monorepo. Each project has its own `project.json` with its targets.

| Path                       | Package                    | What it is                                                                                       |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `libs/app`                 | `@ng-doc/app`              | The Angular UI of a docs site: pages, demos, playgrounds, search, navigation.                    |
| `libs/ui-kit`              | `@ng-doc/ui-kit`           | The generic Angular UI kit that `@ng-doc/app` is built on.                                       |
| `libs/core`                | `@ng-doc/core`             | Types and helpers shared by the runtime and the builder, such as `NgDocPage`.                    |
| `libs/utils`               | `@ng-doc/utils`            | HTML post-processing for the builder: code highlighting and keyword links.                       |
| `libs/keywords-loaders`    | `@ng-doc/keywords-loaders` | Loaders for external keywords (Angular, RxJS, NgDoc).                                            |
| `libs/builder`             | `@ng-doc/builder`          | The builders, schematics and both engines. The new engine lives in `libs/builder/generator`.     |
| `libs/add`                 | `@ng-doc/add`              | The `ng add` schematics.                                                                         |
| `apps/ng-doc`              | (not published)            | The documentation site, [ng-doc.com](https://ng-doc.com/). Its guides are in `apps/ng-doc/docs`. |
| `tools/scripts`            | (not published)            | Build, test-runner and local-serve scripts (plain Node ESM).                                     |
| `plugins/semantic-release` | (not published)            | Custom semantic-release plugins used by the release workflow.                                    |

## The two engines

`@ng-doc/builder` ships two engines that turn a docs tree into an Angular application:

- **The new engine** is the default. It runs through the Vite builders (`vite-application`,
  `vite-dev-server`), the `modern-*` Angular CLI builders, the Vite plugin and the `ng-doc` CLI. Its
  code is in `libs/builder/generator`.
- **The legacy builders** (`application` and `dev-server`) are deprecated. They still ship and keep
  existing projects working, but they get no new features and will be removed in a future major
  release.

**New features and fixes go to the new engine.** Some code is shared by both engines: the
templates, the helpers in `libs/builder`, `@ng-doc/core` and `@ng-doc/utils`. A change there must
keep both engines working, and what users see must stay the same in both. CI compares the
production output of the two engines in the `parity` job.

## 🛠️ Making a change

Keep each pull request focused on one change, and add or update tests in the same pull request as
the behaviour they cover. Don't reformat code you didn't otherwise change.

### Tests

**Libraries and the docs site.** Every project's specs run on [Vitest](https://vitest.dev/) through
Nx:

```bash
npx nx test app                          # also: ui-kit, ng-doc, core, utils, keywords-loaders, add, builder
npx nx test builder -- migrate-to-vite   # pass a Vitest filter after --
npx nx run app:test-zoneless             # app and ui-kit run their specs again without zone.js
npx nx run app:test-search-index         # the search index specs
npm run test                             # every project
```

<a id="generator"></a>

**The new engine (`libs/builder/generator`).** Nx does not run these suites. A dedicated runner
does, and it enforces a coverage gate for each group of tests (at least 90 % of lines, statements
and functions, and 85 % of branches):

```bash
node tools/scripts/check-builder-modernization.mjs --list
```

`--list` prints every group with its lane, runner, timeout, weight (`light` or `heavy`) and number
of CI shards. To run tests, pass a `--log-dir` that **doesn't exist yet**; the runner writes its
logs and `results.json` there and refuses to overwrite an earlier run. `tmp/` is ignored by Git.

```bash
# The light core groups, a few at a time (a couple of minutes)
node tools/scripts/check-builder-modernization.mjs --weight light --log-dir tmp/runs/light-1

# The groups for the area you changed
node tools/scripts/check-builder-modernization.mjs --group worker --log-dir tmp/runs/worker-1

# One shard of a large group, the way CI splits it
node tools/scripts/check-builder-modernization.mjs --group compiler --shard 1/4 --log-dir tmp/runs/compiler-1

# Every group, including the posix lane (Linux and macOS only)
node tools/scripts/check-builder-modernization.mjs --lane posix --log-dir tmp/runs/all-1
```

Without `--lane`, the runner uses the `core` lane, which works on every OS. Some groups take several
minutes, so run the groups for your area while you work and let CI run the rest. A shard doesn't
gate coverage on its own: CI merges the shards with `--merge-coverage` and gates the result.

**Tool scripts** in `tools/scripts` are tested with Node's test runner:

```bash
node --test tools/scripts/testing/*.test.mjs
```

### Lint and format

```bash
npx nx lint <project>   # for example: npx nx lint builder
npm run lint            # every project
npx nx format:write     # Prettier
```

Prettier uses single quotes, trailing commas and a line length of 100. The pre-commit hook lints and
formats your staged files, so most issues are fixed for you.

### Search and keyword baselines

CI checks the docs site's search index and keywords against reviewed snapshots in
`libs/builder/generator/acceptance/production/accepted`. When your change alters the site's content
or search output on purpose, update the snapshots and commit them with your change:

```bash
npx nx run ng-doc:build
node libs/builder/generator/acceptance/production/source-stamp.mjs dist/apps/ng-doc/browser
npx nx run ng-doc:build-vite --excludeTaskDependencies
node libs/builder/generator/acceptance/production/source-stamp.mjs dist/apps/ng-doc-vite/browser
NGDOC_PARITY_CURRENT=dist/apps/ng-doc-vite/browser NGDOC_PARITY_ACCEPT=1 \
  node libs/builder/generator/acceptance/production/parity.mjs
```

The script first compares the two engines' output and updates the snapshots only when they match.
It writes a summary of what changed to `tmp/ngdoc-parity/accepted-diff.json`; check that every
change there is one you meant. Build both outputs from the same files: any edit between the two
builds fails the stamp check, and you build again.

### Documentation

If your change affects people who write docs with NgDoc (a new option, page feature, component
input or diagnostic), document it in `apps/ng-doc/docs`, next to the guides on the same topic.
Anything exported from a library's public entry point is public API: give it a JSDoc comment, and
treat a rename or removal as a breaking change.

### More detail

The developer guide in [`.agents/skills/ng-doc-developer`](.agents/skills/ng-doc-developer/SKILL.md)
goes deeper: the architecture of the new engine and its invariants, which tests a generator change
must add, the end-to-end harnesses, code style and every CI job. It is written for AI coding agents
but reads fine for people too. Start with [`SKILL.md`](.agents/skills/ng-doc-developer/SKILL.md) and
open the reference for the area you touch.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), with a scope:

```text
type(scope): short summary in the imperative
```

- **Types:** `feat`, `fix`, `perf`, `docs`, `test`, `refactor`, `build`, `ci`, `chore` and the other
  standard types.
- **Scopes:** usually the project, such as `builder`, `app`, `ui-kit`, `core`, `utils`,
  `keywords-loaders`, `add`, `ng-doc` (the docs site) or `project` (repository-wide tooling).
- **Breaking changes:** add a `BREAKING CHANGE:` footer that says what changed and how to migrate.
  **Never use `!`** in the header: the release tooling doesn't read it, so the change is released
  wrongly or not at all.

Good examples:

```text
fix(builder): keep watch inputs after a failed generation
```

```text
docs(ng-doc): explain how to link to an API page from a guide
```

```text
feat(add): set up the Vite engine when ng add runs on a new application

BREAKING CHANGE: `ng add @ng-doc/add` sets up the Vite builders instead of the legacy ones for new
standalone applications; pass `--engine legacy` to keep the previous setup.
```

A `commit-msg` hook runs [commitlint](https://commitlint.js.org/) and rejects a message that doesn't
follow the format.

## 🔍 Pull requests

Open your pull request against `main` and fill in the template: link the issue, say what changed
and whether it is breaking.

**What CI runs.** One job builds the packages, and then every check runs as its own job, so one
failure never hides another. Most checks run on Linux, and the platform-sensitive ones also run on
Windows. Roughly, CI runs:

- lint for every project;
- each project's unit tests, one job per test target;
- the tool-script tests, on Linux and Windows;
- every generator test group and shard, with coverage gates on Linux and without coverage on
  Windows;
- production builds of the docs site with both engines, the parity check between them, and the
  search and keyword baselines;
- end-to-end checks that install the packed packages into fresh projects, including `ng add`, on
  Linux, Windows and macOS.

A final **PR checks passed** job waits for all the others and fails unless every one of them
succeeded, so branch protection requires only that one check. A new job in `pr.yml` must be added
to its `needs`; `tools/scripts/check-ci-jobs.mjs` fails the build when one is missing.

A pull request is ready to merge when every check passes. If a check fails for a reason that looks
unrelated to your change, say so in the pull request and a maintainer will take a look.

**What reviewers look for:**

- the change does one thing, and touches only what that needs;
- tests cover the new behaviour, including the failure paths, in the framework the area already
  uses;
- fixes and features target the new engine, and shared code still works with both engines;
- author-facing changes are documented in `apps/ng-doc/docs`;
- public API changes have JSDoc, and breaking ones have a `BREAKING CHANGE:` footer and a migration
  path;
- no generated files are committed, such as `dist/`, caches or coverage.

Please don't take review comments personally. They keep the codebase consistent, which helps
everyone who works on it later.

## Releases

Releases are automated with semantic-release, and only maintainers trigger them. Only `feat`, `fix`,
`perf` and `revert` commits produce a release, which is why the commit format matters. Maintainers
publish stable releases from the `release` branch and prereleases from `beta`; both are fed from
`main` by the `create-release` and `create-beta` workflows.

## 💬 Getting help

- **Questions about using NgDoc:** start with the [documentation](https://ng-doc.com/), then open
  an [issue](https://github.com/ng-doc/ng-doc/issues/new/choose) if it doesn't answer them.
- **Questions about a contribution:** ask in the issue you're working on, or open a draft pull
  request and ask there. Early questions are welcome; a draft is a good way to check the direction
  before you finish.

Happy contributing! ❤️
