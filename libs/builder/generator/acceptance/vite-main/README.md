# Full self-hosted Vite acceptance

`run-bounded.mjs` runs the actual `apps/ng-doc` sources and complete documentation through the packaged generator Vite entry and Analog AOT, with a separate temporary output/cache/configuration. Build the workspace libraries and generator first. Run with the lockfile-compatible Node runtime:

```sh
node libs/builder/generator/acceptance/vite-main/run-bounded.mjs
```

The harness checks real browser routes and demo interaction, served search bytes, development SSR, production browser/server bundles, search parity and representative prerendered routes with a hydrated demo click. Complete-route prerendering remains a separate acceptance requirement; three representative routes do not prove it. Each run writes its status and failures to `NGDOC_VITE_MAIN_EVIDENCE` (default `tmp/acceptance/vite-main`, ignored by git); this README records no results.

The semantic generator retains the site configuration's documentation tsconfig. Analog uses a fixture tsconfig pointing to built Angular libraries and this run's generated entry. Optional nonexistent app asset directories are skipped, as in the native application configuration; present UI and application assets are copied. No source fixture edits are made in the shared application.

The current candidate host opts into Analog `liveReload: true` and declares `analogLiveReload: true` to the NgDoc adapter. Earlier source1505 evidence predates this completion protocol; the configuration change alone is not new passing evidence.

Overrides: `NGDOC_VITE_MAIN_GENERATOR` (an immutable built generator directory for before/after comparison), `NGDOC_VITE_MAIN_EVIDENCE`, `NGDOC_VITE_MAIN_TIMEOUT_MS` (default600000), `PLAYWRIGHT_MODULE`, `CHROME_PATH`; `KEEP_VITE_MAIN_FIXTURE=1` preserves the temporary workspace for diagnosis. The default browser paths use the prepared local runtime. Servers/browser are closed and temporary outputs removed in cleanup; the bounded parent terminates only its owned child group on timeout.

The harness forwards Analog public build/hot-update hooks unchanged while recording whether the generated entry exists. Only hooks whose pinned Analog implementation can trigger Angular compilation participate in the readiness assertion; raw non-compiling events are retained separately. Baseline evidence records early TypeScript triggers, not a count of completed compilations.

Development SSR and subsequent production builds run in separate Node processes, matching CLI execution. Importing zone.js/node changes global Promise identity and breaks sass-embedded importer detection in a later build in the same process. The parent retains a nested production result and propagates subprocess failure. Production rendering occurs only after both browser and server builds finish.

Production host configuration carries over the site's production environment file replacements and verifies Angular production mode in both browser and SSR.

The server build uses `ssr.noExternal: true` so Angular partial dependencies are linked into the standalone bundle. The build harness itself imports Analog, which can preload Angular compiler; successful rendering in that process alone does not prove standalone server loading. The complete prerender of the site is the production acceptance (`production-c`).
