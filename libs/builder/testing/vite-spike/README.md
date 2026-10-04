# Isolated Angular / Vite browser spike

Run from the repository root with Node 24 and installed dependencies:

```sh
node libs/builder/testing/vite-spike/run.mjs
```

The harness uses the bundled Playwright at the default path shown in `run.mjs` and system Chrome. Set `PLAYWRIGHT_MODULE` to an installed Playwright package directory and `CHROME_EXECUTABLE` to a Chromium executable on other machines. It does not install dependencies or use a browser profile.

It creates a fresh `.runtime/run-*` fixture, Vite cache and output directory, reserves a free loopback port, runs real Chrome assertions, probes SSR separately, closes browser/server and removes the runtime directory. `KEEP_SPIKE_FIXTURE=1` retains the generated files for inspection. Shared `dist` is never read or written. Evidence is written to `tmp/acceptance/vite-spike/` (ignored by git). Set `NGDOC_SPIKE_EVIDENCE` to another evidence root for a review run; diagnostic switches add their subdirectory beneath that root.

The static Angular sources live in `fixture/`. Only the guide page, wrapper, playground and route manifest are generated. The first three use the current real Builder Nunjucks templates; metadata is deliberately a small explicit fixture, not an alternative generator implementation. `@ng-doc/app`, `@ng-doc/core` and `@ng-doc/ui-kit` resolve to repository sources. There are no runtime mocks.

The test covers completed Angular bootstrap; real demo interaction; real NgDoc playground controls, aliased signal/model inputs and DI; external HTML/SCSS and updates; a new generated route in the same server; TypeScript and Angular template diagnostics followed by recovery. SSR uses Vite's `ssrLoadModule` and Angular `renderApplication`, recorded independently from browser success.

Two diagnostic switches preserve investigated race conditions:

```sh
node libs/builder/testing/vite-spike/run.mjs --without-dynamic-prebundle
node libs/builder/testing/vite-spike/run.mjs --unsynchronized-add
```

They write to separate evidence subdirectories. Both races depend on timing: a successful run does not disprove them. The first removes explicit dynamic Shiki/Esthetic prebundling. The second navigates immediately after file writes instead of awaiting native watcher observations, verifying the new transformed route, and observing a new browser document whose completed Angular bootstrap imported that route. The normal run then navigates using the real RouterLink. The normal test never manually invalidates Analog's compiler and never restarts Vite.

This is an executable feasibility test, not the production Vite adapter or gate C. See the compatibility report for exact results and remaining work.
