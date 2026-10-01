# production-c

The native production acceptance for the Vite host (Vite + Analog, physical generated files) on the real `apps/ng-doc` sources. It is a product test: it builds the committed `apps/ng-doc/vite.config.mjs` (through its `ngDocSiteConfig` factory, with a probe page, its own roots and the `/preview/` base) with the product pipeline, `buildNgDocViteApplication`, which the `@ng-doc/builder:vite-application` builder and `ng-doc prerender` run.

It checks the following:

- **Broken page.** A never-opened broken page fails the build. After it is repaired, the browser build, the server build and the prerender succeed, and the application logs no error while prerendering.
- **Materialization.** Production materialization is complete, and a warm rebuild of search and keywords matches.
- **Routes.** Expected routes are discovered independently of the generator. Every route of the recorded baseline must still exist, except the entries that `onlyForTags` leaves out, the sections removed by the documentation rework, the `@ng-doc/builder` API routes outside its narrowed scope and the API routes of the declarations removed in 22.0.0 (`REMOVED_API_ROUTES` in `audit.mjs`, required to be gone). The builder scope must route exactly the list in `audit.mjs` (`BUILDER_API_ROUTES`); update it when that scope changes. The product's `prerendered-routes.json` must contain the expected routes.
- **Fresh-process audit.** Every prerendered page has its content and hydration, the client shell keeps `<base href="/preview/">`, and assets are served under `/preview/`. Hydration, themes and HTTP search (the search palette: a query, then a click on a guide row, which navigates under the base) are checked in Chrome.

## Running

```sh
NGDOC_PRODUCTION_C_EVIDENCE=/abs/new-evidence-dir \
NGDOC_PRODUCTION_C_GENERATOR=/abs/private-build/builder/generator \
node libs/builder/generator/acceptance/production-c/run-bounded.mjs
node libs/builder/generator/acceptance/production-c/reconcile.mjs /abs/new-evidence-dir
node --test libs/builder/generator/acceptance/production-c/*.test.mjs
```

| Variable                          | Default                       | Meaning                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NGDOC_PRODUCTION_C_EVIDENCE`     | required                      | Directory for `build-results.json`, `audit-results.json` and the inventories. Use a new directory; never tracked evidence.                                                                                                                                                                                                                             |
| `NGDOC_PRODUCTION_C_GENERATOR`    | `dist/libs/builder/generator` | The generator build under test. It must be this checkout's `dist/libs/builder/generator`, which the committed Vite configuration loads: for a private build, run the harness in a private copy of the repository with its own `dist`, never by rebuilding the shared one. Its source digest must match the checkout, or the run fails before building. |
| `NGDOC_PRODUCTION_C_TIMEOUT_MS`   | `1200000`                     | Deadline for the owned process group (`run-bounded.mjs`). A timeout is a failure.                                                                                                                                                                                                                                                                      |
| `NGDOC_PRODUCTION_C_KEEP_FIXTURE` | unset                         | `1` keeps the temporary fixture under `tmp/ngdoc-production-c-*` for diagnosis.                                                                                                                                                                                                                                                                        |

The harness needs Chrome (`CHROME_PATH`) and a Playwright module (`PLAYWRIGHT_MODULE`); the defaults are the local paths in `audit.mjs`. A full run builds and prerenders the whole site. Expect several minutes. The route enumeration it used to carry is now the product's (`generator/vite/route-inventory.ts`, tested in `vite/testing/prerender.vitest.ts`).
