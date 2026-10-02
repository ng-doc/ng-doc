# Repository layout and commands

See also `CONTRIBUTING.md` at the repository root, which covers the contribution flow, useful commands and the release and beta process.

## Layout

| Path                       | Nx project         | Package                    | What it is                                                                                                                                                                        |
| -------------------------- | ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ng-doc`              | `ng-doc`           | (not published)            | The documentation site (ng-doc.com), built with NgDoc itself.                                                                                                                     |
| `libs/app`                 | `app`              | `@ng-doc/app`              | Runtime Angular UI of a docs site: page, demo, playground, search, sidebar, type controls, processors.                                                                            |
| `libs/ui-kit`              | `ui-kit`           | `@ng-doc/ui-kit`           | Generic Angular UI kit used by `app`.                                                                                                                                             |
| `libs/core`                | `core`             | `@ng-doc/core`             | Types and helpers shared by runtime and builder (`NgDocPage`, `NgDocCategory`, `NgDocApi`, ...). Framework-agnostic at runtime; Angular appears only in type positions. CommonJS. |
| `libs/utils`               | `utils`            | `@ng-doc/utils`            | HTML post-processing for the builder (rehype, Shiki highlighting, keyword replacement). ESM.                                                                                      |
| `libs/keywords-loaders`    | `keywords-loaders` | `@ng-doc/keywords-loaders` | Loaders for external keywords (Angular, RxJS, NgDoc).                                                                                                                             |
| `libs/builder`             | `builder`          | `@ng-doc/builder`          | Angular CLI builders, schematics, the legacy engine and the new generator engine.                                                                                                 |
| `libs/add`                 | `add`              | `@ng-doc/add`              | `ng add` schematics (`libs/add/schematics`). Built directly with `tsc`; it has no `pre-build`.                                                                                    |
| `tools/scripts`            | -                  | -                          | Build, publish, test-runner and local-serve scripts (Node ESM).                                                                                                                   |
| `plugins/semantic-release` | -                  | -                          | Custom semantic-release plugins (package publishing, dependency updates).                                                                                                         |

Inside `libs/builder`:

- `generator/`: the new generator engine. See [builder-generator.md](builder-generator.md).
- `engine/`, `application/`, `dev-server/`: the legacy engine and its Angular CLI builders. See [builder-legacy-and-hosts.md](builder-legacy-and-hosts.md).
- `templates/`: Nunjucks templates. Both engines use them.
- `helpers/`, `parsers/`, `types/`, `interfaces/`: shared by both engines.
- `classes/`, `operators/`: legacy RxJS helpers.
- `testing/`: legacy-engine specs (run by `nx test builder`) and standalone host harnesses.
- `schematics/`: page, category and API generators, the opt-in `migrate-to-vite` schematic, and `ng update` migrations.

The generated and ignored directories are listed in [agent-safety.md](agent-safety.md).

## Environment

- **Node:** 22.0 requires Node 24: `@ng-doc/builder` declares `engines.node` `>=24.15.0 <25`. Every workflow job pins Node `24.19.0` through `.github/actions/nodejs` (input `node-version`), and the packed-consumer check also runs on 24.15.0 and 24.21.0.
- **Package manager:** npm, installed with `npm ci` from the committed lockfile.
- **Toolchain:** Angular 22, Nx 23, TypeScript 6, Vite 7, Vitest 4 (every test suite; there is no Jest) and the Analog Vite plugin. Versions are pinned exactly in `package.json`, so don't upgrade them as a side effect of other work.
- **Nx:** inference plugins are off (`useInferencePlugins: false`, and `.env` sets `NX_ADD_PLUGINS=false`). Every target is declared in a `project.json`.
- **Non-interactive runs:** in agent shells and scripts, set:

  ```sh
  export NX_DAEMON=false NX_NO_CLOUD=true NX_TUI=false
  ```

  - `NX_NO_CLOUD` avoids Nx Cloud calls, because `nx.json` carries a cloud token.
  - `NX_DAEMON=false` avoids a background daemon outliving your command.
  - The builder test runner sets `CI=1`, `NX_DAEMON=false` and `NX_NO_CLOUD=true` for its children itself.

- **Zone.js:** the site is zoneless (`provideZonelessChangeDetection()` in `main.ts`/`main.server.ts`, no `zone.js` polyfill in any target, `vite.config.mjs` or `serve-docs-vite.mjs`). The `app` and `ui-kit` specs run twice: with the zone test setup (`test`) and without zone.js (`test-zoneless`).
- **i18n:** the site is not localized and there is no i18n workflow. Ignore the `ng-doc:extract-i18n` target.

## Build

The `build` target of most libraries depends on their `pre-build` target, which depends on `^build`. Nx builds dependencies first, and outputs go to `dist/libs/<name>`.

```sh
npx nx run builder:build     # legacy tsc build + schemas + the generator bundle (tools/scripts/build-generator.mjs)
npx nx run app:build
npx nx run-many --target=build --projects=core,utils,ui-kit,keywords-loaders,builder,app --parallel=1
```

- **Package set:** the last command builds the whole set used by the docs app and by the generator acceptance suites. It is the same command CI uses, where it adds `--skipNxCache`.
- **Generator bundle:** `node tools/scripts/build-generator.mjs [--outdir <dir>]` rebuilds only the new engine's bundle. The default output is `dist/libs/builder/generator`; `NGDOC_GENERATOR_OUT_DIR` also overrides it. Use `--outdir` for a private build that doesn't disturb consumers of the shared `dist`.

The rules for rebuilding while something else is running are in [agent-safety.md](agent-safety.md) ("The shared `dist` is live").

## Serve the documentation site

- **Where the builders come from:** the site's builders are loaded from `dist/libs/builder`. The `serve` and `build` targets name them through `tools/builders`, a builder alias whose `builders.json` takes the options schemas from the sources and the implementations from `dist/libs/builder`. Nx reads every task's executor and schema before it runs any task (to look for a custom hasher), so this is what lets `nx serve` and `nx build` start on a fresh clone without `dist`; `tools/scripts/testing/site-builders.test.mjs` keeps the alias in step with `libs/builder/builders.json`. The other targets name `./dist/libs/builder:*` directly (their schemas are generated at build time) and fail before running anything until the packages are built once.
- **Linking:** the `ng-doc:link-libs` target symlinks the built packages from `dist/libs/*` into `node_modules/@ng-doc/*` for `app`, `ui-kit`, `builder`, `keywords-loaders`, `core` and `utils`, and links `core` and `utils` into the builder's own `node_modules`. A fresh clone has no `node_modules/@ng-doc` until it runs. The site's `tsconfig.vite.json` and `tsconfig.modern.json` repeat the library `paths` of `tsconfig.build.json`, because a `paths` override replaces the inherited mappings as a whole; `tools/scripts/testing/site-package-links.test.mjs` checks both.
- **Nx targets:** the targets below build and link first, through `dependsOn`, so a fresh clone needs only `npx nx serve ng-doc`.
- **`serve-docs-vite.mjs` does not build.** Before starting it, run the package-set build, and run `npx nx run ng-doc:link-libs` once on a fresh clone. Rebuild after source changes.

| Mode                                                | Command                                          | Engine                                                                     |
| --------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Vite/Analog dev host (**default development mode**) | `node tools/scripts/serve-docs-vite.mjs`         | New generator through the Vite plugin with physical generated files.       |
| Vite/Analog dev host through the Nx target          | `npx nx serve ng-doc` (or `npm run serve`)       | New generator through `vite-dev-server` and `apps/ng-doc/vite.config.mjs`. |
| Angular CLI dev host with the new generator         | `npx nx run ng-doc:serve-modern`                 | New generator through the `modern-dev-server` builder.                     |
| Angular CLI dev host with the legacy engine         | `npx nx run ng-doc:serve-legacy`                 | Legacy engine (`dev-server` builder).                                      |
| Legacy proof-of-concept site                        | `npm run poc` (`nx run ng-doc:serve-legacy:poc`) | Legacy engine on `apps/ng-doc/poc` only.                                   |

`serve-docs-vite.mjs` takes no arguments; it is configured by environment:

| Variable                | Default                      | Meaning                                                                                                |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `NGDOC_LOCAL_PORT`      | `4317`                       | Port on `127.0.0.1`.                                                                                   |
| `NGDOC_LOCAL_CONTENT`   | `file`                       | Only `file` (physical generated files) is accepted. Any other value, including `virtual`, is rejected. |
| `NGDOC_LOCAL_STATE_DIR` | temporary dir                | Keep generated, cache and Vite state across restarts (warm start).                                     |
| `NGDOC_LOCAL_READY`     | `tmp/ngdoc-local-ready.json` | Ready file with `{ url, fixture, pid }`.                                                               |
| `NGDOC_LOCAL_TRACE`     | unset                        | JSONL trace of the Angular plugin hooks.                                                               |

Production builds:

```sh
npx nx build ng-doc                      # Vite engine: browser + server build + prerender -> dist/apps/ng-doc-vite
npx nx run ng-doc:build-modern           # new generator (Angular CLI) -> dist/apps/ng-doc-modern
npx nx run ng-doc:build-legacy           # legacy engine, SSR + prerender -> dist/apps/ng-doc
```

- **Vite engine:** `build` and `serve` run `apps/ng-doc/vite.config.mjs` through the `vite-application` and `vite-dev-server` builders. The configuration loads the plugins from `dist/libs/builder/generator`, uses `tsconfig.vite.json` and writes the generated files to `ng-doc-modernization/ng-doc/ng-doc-vite` (cache `.cache/ng-doc/ng-doc-vite`). The same pipeline runs without Nx: `node dist/libs/builder/generator/bootstrap/bin.js prerender --vite-config apps/ng-doc/vite.config.mjs --output-path dist/apps/ng-doc-vite`. In a private copy of the repository, add `--excludeTaskDependencies` to the Nx targets so that `link-libs` does not rebuild or relink the shared packages.

- **Caching:** `build` takes `cache: true` and the `production` inputs from the `build` target defaults in `nx.json`; its own `dependsOn` (`link-libs`) replaces the default `pre-build`. The other site targets are not cached.
- **Config files:** `apps/ng-doc/ng-doc.config.ts` is the site configuration. `ng-doc.config.modern.ts` extends it for the new-generator targets (output `ng-doc-modernization/`, cache on). `ng-doc.config.poc.ts` points at `apps/ng-doc/poc`.

## Test and lint

```sh
npx nx test <project>                    # Vitest: every library, the site and the builder's *.spec.ts
npx nx run <app|ui-kit>:test-zoneless    # the same specs without zone.js
npx nx run app:test-search-index          # the Vitest specs of the app search index
npm run visual                           # Playwright visual harness against a served site (apps/ng-doc/testing/visual)
npx nx lint <project>
npx nx affected --target=lint            # lint only the projects a change affects
npx nx format:write                      # Prettier through Nx
npm run test / npm run lint              # every project
node --test tools/scripts/testing/*.test.mjs   # tool-script tests
```

- **Generator tests:** the new generator engine has its own Vitest suites and a dedicated runner with coverage gates. See [builder-testing.md](builder-testing.md).
- **How `nx test` runs:**
  - `app`, `ui-kit` and `ng-doc` use `@angular/build:unit-test` (jsdom). Its `buildTarget` is the project's `build-specs` target, which only supplies build options: `polyfills: ['zone.js']` for `test` and none for the `zoneless` configuration used by `test-zoneless`. `vitest.config.ts` (and `vitest.zoneless.config.ts`) in the project set the environment and the coverage directory; `test-setup.ts` gives the specs jsdom's `AbortController`.
  - `builder`, `add`, `core`, `utils` and `keywords-loaders` run `vitest run --config libs/<project>/vitest.config.ts` (Node environment). These configs alias `@ng-doc/*` to the sources through the `tsconfig.base.json` paths (`tools/vitest/workspace-aliases.ts`), so the specs do not load `dist`, except the legacy-generator harness, whose child process loads the built builder.
  - `builder` and `add` load `tools/vitest/typescript-require.ts`: `SchematicTestRunner` `require`s the schematic factories through Node, and the hook compiles those TypeScript sources to CommonJS. A spec that spies on a module the schematic uses must `require` it too, to get the same module object (see `ng-add-edge-cases.spec.ts`).
  - `--configuration=ci` adds coverage. Pass Vitest filters after `--`, for example `npx nx test builder -- migrate-to-vite`.

## Git hooks and CI

- **pre-commit:** Husky runs `lint-staged`, which runs `nx affected:lint --fix` and `nx format:write` on the staged files.
- **commit-msg:** runs commitlint (Conventional Commits). See [code-style.md](code-style.md).
- **`pr.yml` workflow** (every pull request, and manual dispatch): one `build` job builds every `type:lib` project once and uploads `dist/libs` as the `packages` artifact. Every check is then its own job that needs `build`, downloads `packages` and runs exactly one check. All matrices use `fail-fast: false`, every job has a timeout, and a newer push to the same pull request cancels the running workflow. A final `pr-checks-passed` job aggregates them (see **Gate** below), and the Windows jobs count towards it like the others.

  | Job                   | Runs on               | Check                                                                                                                                                                                                                                                                          |
  | --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `lint`                | Linux                 | `nx run-many --target=lint`                                                                                                                                                                                                                                                    |
  | `unit`                | Linux                 | one job per test target of a project with specs: `app:test`, `app:test-zoneless`, `app:test-search-index`, `ui-kit:test`, `ui-kit:test-zoneless`, `ng-doc:test`, `add:test`, `builder:test` (`--configuration=ci`)                                                             |
  | `tools`               | Linux, Windows        | `node --test "tools/scripts/testing/*.test.mjs"`                                                                                                                                                                                                                               |
  | `generator`           | Linux, Windows        | one job per unsharded runner group: the core groups on both, the posix groups (`bootstrap`, `angular`) on Linux only. Linux measures and gates coverage; Windows runs the same tests with `--no-coverage`                                                                      |
  | `generator-shard`     | Linux, Windows        | one job per shard of a sharded group, split by `shardWeights`: `compiler` (`1/4` to `4/4`) and, on Linux only, `vite-adapter` (`1/3` to `3/3`); a Linux shard uploads its blob report (`generator-blob-<group>-<shard>`), Windows runs without coverage                        |
  | `generator-coverage`  | Linux                 | one job per sharded group, after every `generator-shard` job: `--merge-coverage` replays the shards' blob reports and enforces the group's gate over the merged coverage                                                                                                       |
  | `windows-processes`   | Windows               | natively, the Windows process supervision: `bootstrap/testing/process-tree.vitest.ts` (`ng-doc dev -- <command>`, `.cmd` hosts, process trees) and `vite/testing/ssr-renderer.vitest.ts`                                                                                       |
  | `site-legacy`         | Linux                 | `ng-doc:build-legacy`, a source stamp, the output uploaded for `parity`, then `apps/ng-doc/testing/ssr-entry/verify-built-server.mjs`                                                                                                                                          |
  | `site-vite`           | Linux                 | `ng-doc:build`, a source stamp, then `acceptance/production-c` (harness tests, run, reconcile)                                                                                                                                                                                 |
  | `site-modern`         | Linux                 | `ng-doc:build-modern`                                                                                                                                                                                                                                                          |
  | `parity`              | Linux                 | the source stamp tests (`acceptance/production/*.test.mjs`), then `acceptance/production/parity.mjs` on the `site-legacy` and `site-vite` outputs                                                                                                                              |
  | `vite-main`           | Linux                 | `acceptance/vite-main/run-bounded.mjs`                                                                                                                                                                                                                                         |
  | `runtime-links`       | Linux                 | the `acceptance/runtime-links` Vitest suite with its coverage gate: page-link URLs under SSR, and the site's header, landing and fallback links resolved against `apps/ng-doc/docs`                                                                                            |
  | `packed-consumer`     | Linux                 | `acceptance/package-consumer/run.mjs` (tarball install, watch, build, serve smoke, browser, SSR) on Node 24.15.0, 24.19.0 and 24.21.0                                                                                                                                          |
  | `packed-optional`     | Linux                 | `acceptance/package-optional/run.mjs`                                                                                                                                                                                                                                          |
  | `packed-interruption` | Linux                 | `acceptance/package-consumer/interrupt-probe.mjs`                                                                                                                                                                                                                              |
  | `ng-add-e2e`          | Linux, Windows, macOS | `acceptance/ng-add-e2e`: harness tests, then one scenario per job of `scenarios.e2e.mjs` (packed tarballs from a local `@ng-doc` registry; A: `ng new`, `ng add @ng-doc/add`; B: the legacy builders migrated with `migrate-to-vite`; each `ng build` and an `ng serve` smoke) |

  - **Linking:** the `unit`, site, `parity` and `vite-main` jobs link the downloaded packages with `nx run ng-doc:link-libs --excludeTaskDependencies`, and every Nx target in a check job runs with `--excludeTaskDependencies`, so no check rebuilds the packages. The builder's legacy-generator harness runs the built engine in a child process and needs these links.
  - **Windows jobs** check out LF line endings (`core.autocrlf false`) and point `TEMP`/`TMP` at the runner's temporary directory.
  - **Browser jobs** install an isolated Playwright with Chromium through `.github/actions/browser`, which sets `PLAYWRIGHT_MODULE` and `CHROME_PATH`.
  - **Packed jobs** export `NGDOC_EXPECTED_SOURCE_DIGEST` from `dist/libs/builder/generator/build-provenance.json`; `packed-consumer` and `packed-interruption` also install the browser.
  - **Coverage guard:** the `build` job first runs `node tools/scripts/check-ci-jobs.mjs` (tested in `tools/scripts/testing/check-ci-jobs.test.mjs`). It fails when the `generator` and `generator-shard` matrices differ from the runner's groups, lanes and shard counts (every shard once per OS, coverage on Linux and `coverage: 'off'` on Windows), when `generator-coverage` does not merge exactly the sharded groups after the shards, when a generator, shard or merge step does not pass the matrix lane (`--lane`), when a `test*` target of a project with specs has no `unit` job, or when the `pr-checks-passed` gate is missing, does not run with `if: ${{ always() }}` or does not need every other job. A target that runs the project's specs (`@angular/build:unit-test`, or `vitest run --config <project>/vitest.config.ts`) needs no job while the project has none. A new runner group or test target therefore needs a matrix entry (a posix group also goes into the `exclude` and `include` lists; a sharded group goes into `generator-shard`, with its `shards` and, if it has fewer shards than the `shard` axis, `exclude` entries, and into `generator-coverage`).
  - **Gate:** `pr-checks-passed` ("PR checks passed") runs with `if: ${{ always() }}`, needs every other job, checks out nothing and fails unless every needed job's result is `success`; it prints a table of the results. A skipped job fails it too, unless its id is in the step's `ALLOWED_SKIPS` (for a job whose static `if:` skips it on purpose; none does today). Branch protection on `main` requires only "PR checks passed", so a new job must be added to the gate's `needs`, or it would not block a merge. The coverage guard enforces this.
  - **Dependencies:** `.github/actions/nodejs` restores `node_modules` itself from a cache keyed by OS, architecture, Node version and the `package-lock.json` hash, and runs `npm ci` only on a miss. Pull request jobs never save the cache: a lockfile change in a pull request would otherwise add a large cache per run and evict the base branch's caches (10 GB per repository). Artifacts are kept for 3 days.

- **`seed-caches.yml` workflow** (push to `main`, and manual dispatch): the only writer of the `node_modules` cache. For every OS and Node version the `pr.yml` jobs use, it checks for the cache without downloading it, and on a miss installs and saves it, right after `npm ci` and before anything writes into `node_modules` (such as the `@ng-doc` links that the jobs recreate with `ng-doc:link-libs`).

- **`lint.yml` and `test.yml`** are reusable workflows that only `release.yml` calls (affected lint and affected `test`, `test-zoneless`, `test-search-index`).
- **Releases:** semantic-release publishes from three kinds of branch: `release` (stable), `beta` (prerelease) and `N.x` maintenance branches.
  - `release` and `beta` are fed from `main` through the `create-release` and `create-beta` workflow dispatches; `N.x` maintenance branches are pushed to directly.
  - Only `feat`, `fix`, `perf` and `revert` trigger a release. For the breaking-change rule, see [code-style.md](code-style.md).
  - Custom semantic-release plugins live in `plugins/semantic-release/`.
  - `release.yml` builds ng-doc.com with the Vite engine (`ng-doc:build --skipNxCache`) and packs `dist/apps/ng-doc-vite/browser` under the `dist/apps/ng-doc/browser` path that `deploy.yml` syncs.
