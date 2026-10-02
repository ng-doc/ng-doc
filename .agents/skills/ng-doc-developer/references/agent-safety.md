# Safety rules for agents in this repository

These rules prevent the failures that are easy to cause here and hard to notice afterwards: corrupted shared builds, misleading test results, stray processes and edits to generated files.

## The shared `dist` is live

- **Who reads `dist`:** `node_modules/@ng-doc/{app,ui-kit,builder,keywords-loaders,core,utils}` are symlinks to `dist/libs/*` (created by `ng-doc:link-libs`). The docs site, `tools/scripts/serve-docs-vite.mjs`, the Angular CLI targets and the generator acceptance harnesses all load code from `dist`.
- **Don't rebuild it under a running consumer.** Rebuilding the libraries or `builder:build` while a dev server, test run or acceptance harness is using it swaps code under a running process. Stop the consumers first, or build privately:

  ```sh
  node tools/scripts/build-generator.mjs --outdir tmp/<unique-dir>/generator
  ```

- **One build at a time.** Don't run two builds of the same package concurrently.
- **Old `dist` proves nothing about new source.** After editing sources, rebuild before running anything that consumes `dist`. `dist/libs/builder/generator/build-provenance.json` records the `sourceDigest` of the sources a generator build came from.

## Don't edit generated or scratch output

Never hand-edit these, and never commit them. They are rebuilt, regenerated or disposable.

| Path                                                                                                                       | What it is                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `dist/`                                                                                                                    | Build output.                                                                                  |
| `ng-doc/`                                                                                                                  | Legacy engine output for the docs site.                                                        |
| `ng-doc-modernization/`, `.ng-doc-modernization/`                                                                          | New-generator output for the `*-modern` targets.                                               |
| `.cache/ng-doc/`, `.angular/`, `.nx/cache`, `.nx/workspace-data`                                                           | Caches.                                                                                        |
| `coverage/`                                                                                                                | Coverage reports.                                                                              |
| `tmp/`                                                                                                                     | Scratch space. Use it for your own temporary files, runner log directories and private builds. |
| `**/.runtime/` under generator `testing/`/`acceptance/`                                                                    | Test scratch workspaces.                                                                       |
| `.ng-doc-stage-*`, `.ng-doc-output-manifest.json`, `*.compiler-memo.json`, `*.semantic-closures.json`, `*.fast-start.json` | Generator commit and cache internals inside an output or cache root.                           |

To change generated output, change the generator, its templates (`libs/builder/templates`) or the docs source.

## Processes

- **Stop what you start.** Stop every dev server, watcher, browser and background process you start before you finish. The Vite dev server listens on `127.0.0.1:4317` by default.
- **Don't kill what you didn't start.** Check ownership before you stop anything. Another agent or the user may be running a server or a long test.
- **Starting commands:** prefer commands that own their children and exit: the test runner, `vitest run`, `nx` with `NX_DAEMON=false`. Don't leave `--watch` modes running.
- **Long suites:** the posix-lane generator groups and the acceptance harnesses start real Angular/Vite processes and browsers. Run them one at a time, not in parallel with each other or with a build.

## Scratch copies of the repository

- **Symlink, don't install.** When you need an isolated copy (a temporary workspace, a git worktree used for building), symlink the root `node_modules` into it instead of running `npm install`. A fresh install can resolve different versions than the committed lockfile.
- **Writes through links reach the original.** A symlinked `node_modules` is shared, so don't write into it from the copy. Remove scratch copies when you are done.

## Dependencies, versions and publishing

- **Pinned tooling:** don't change `package.json`, `package-lock.json`, Node, Angular, Nx, TypeScript, Vite, Vitest or Analog versions unless the task is that upgrade. The generator build records the toolchain and lockfile digests, and Analog compatibility is pinned per version.
- **Never publish or deploy:** no `npm publish`, `nx run <project>:publish`, release-branch merges or deploy workflows unless the user explicitly asks.
- **Git:** don't commit, push, rewrite history or switch branches unless asked. Leave unrelated working-tree changes untouched.

## Tests and results

- **No weakened gates.** Don't lower coverage thresholds, exclude production files from coverage, add `v8 ignore` comments, skip or `.only` tests, or loosen assertions to get a green run. Fix the code or the test.
- **No overwritten results.** Runner log directories must be new (the runner enforces this). Keep a failed run's output until you understand the failure.
- **Report precisely.** Say which command ran, against which build, and what passed. A mocked integration test does not prove that a real Angular/Vite pipeline works, and a run against an old `dist` proves nothing about new source.
- **Kill switches:** keep every generator kill switch working: `NGDOC_PERSISTENT_WORKER`, `NGDOC_PERSISTENT_WORKER_PRIME`, `NGDOC_DELTA_TRANSPORT`, `NGDOC_INCREMENTAL_SKIP`, `NGDOC_TARGETED_REBUILD`, `NGDOC_SEMANTIC_RECORDER`, `NGDOC_SCOPED_SEMANTIC`, `NGDOC_INCREMENTAL_PROGRAM`, `NGDOC_SHAPE_CLOSURE`, `NGDOC_TRACKED_PROGRAM_REUSE`, `NGDOC_FAST_START`, `NGDOC_ANGULAR_SHARED_PASS`, `NGDOC_ANGULAR_STRUCTURAL_PASS`, `NGDOC_VITE_BUILD_HANDOFF`, `NGDOC_PARALLEL_WRITES`, and the reference path (`incrementalReuse: false`). They are the fallback when an optimization misbehaves in the field. Defaults and option equivalents are in [builder-generator.md](builder-generator.md).

## Platform notes

- **POSIX lane:** the posix-lane runner groups require POSIX process groups, so the core lane is the Windows gate of the runner.
- **Windows processes:** Windows has no process groups. `ng-doc dev -- <command>` and the isolated SSR renderer end their child together with its process tree (`taskkill /T /F`, `bootstrap/process-tree.ts`); `ng`, `npm` and `npx` run through Node (their JavaScript entry), and any other `.cmd`/`.bat` command through `cmd.exe` with quoted arguments, refusing `"`, `%`, `!`, CR and LF. Liveness is Node's own exit status of the child, never a probe of its pid (which may be reused once it exited). A descendant that outlives its parent can't be found there, which the POSIX group check catches. Test them with the platform ports (`platform: 'win32'`, `killTree`) and add native Windows cases with `it.runIf(process.platform === 'win32')`.
- **Windows files:** a rename or removal under an output or cache root can fail with EPERM, EBUSY or EACCES while another process holds a handle. Rename through `retryingRename` (`artifacts/index.ts`), which retries on win32 only. Split text on `'\n'`, never on `os.EOL`, and compare a drive letter through `canonicalDrive` (`vite/paths.ts`) where a path from Vite meets one the engine published.
- **Path comparisons:** macOS temporary paths resolve through symlinks (`/var` → `/private/var`). Compare paths with `realpath` when ownership or overlap matters.
