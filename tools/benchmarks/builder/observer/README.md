# Same-session benchmark work observer

This is harness-only instrumentation, not a generator API or a performance optimization. It is not enabled in accepted packages or the shared dist. Nine Node 24.19 tests pass; `evidence/tests.log` and `test-result.json` retain the command and exit status. The real-service test bundles the current sources into an owned temporary directory, renders a real filesystem guide through the actual compiler, observes real cache miss/write/hit, commits real output followed by a no-op, and distinguishes two dependency refresh calls from one physical observation. It removes its temporary directory. It is not a full B/C/D application benchmark.

## Attachment

The compiler constructs discovery/semantic/cache/content/refresher services internally. The packaged adapters construct the compiler inside disposable workers. A separately instantiated sidecar would therefore be the wrong measurement. `plugin.mjs` uses public esbuild resolution/loading to interpose exact service **exports**, including direct entry points. It does not search/replace source text or change the implementations. All other exports are re-exported unchanged.

Root's private snapshot builder must:

1. Freeze the complete generator source/build input digest and tuple against the uninstrumented comparison build; read the six targeted source hashes with `captureObserverSources(root)` and save them. The six-file guard does not replace full build provenance.
2. Add `createWorkObserverPlugin({ root, expectedSources })` to the normal esbuild configuration when building the **private** compiler, worker/entry, bootstrap entries, Angular application/dev-server entries and Vite entry together. Preserve the existing aliases, definitions, compatibility plugin, external dependencies and packaged templates. Include every normal entry; a compiler-only bundle beside an uninstrumented `worker/entry.js` is insufficient. Required-module validation rejects a build that never reaches the declared services.
3. Install/select that private builder snapshot in the host under test (Angular CLI builders or the Vite host) exactly as for the uninstrumented package. The compiler worker's normal fork inherits environment variables. Do not change worker scheduling or add a second session. No SSR/Angular host implementation needs to be intercepted for these generator counts.
4. Before starting the host, set `NGDOC_BENCHMARK_RUN_ID` to the unique cohort ID and `NGDOC_BENCHMARK_OBSERVER_DIR` to a fresh absolute directory. Record the instrumented and uninstrumented source hash pair, instrumented module metafile, observer implementation hashes and runtime bundle hashes.
5. Run a separate, product-equivalent work-trace cohort. After every owned process joins, call `readObserverTraces(directory, { runId, expectedPids })`, with actual host/compiler-worker PIDs from the supervisor. Require observer-start/end, paired calls and settlements, no failed sink, no active calls, and all expected observed workers. Retain raw JSONL. Missing/killed workers or an incomplete trace invalidate that work cohort; a successful browser alone does not validate counters.

Example integration inside an owned private build (not a ready-to-run shared build command):

```js
const expectedSources = await captureObserverSources(root);
const observed = createWorkObserverPlugin({ root, expectedSources });
await build({ ...normalPrivateBuildOptions, plugins: [...normalPrivateBuildOptions.plugins, observed], metafile: true });
```

Primary timing remains **uninstrumented**. Synchronous trace I/O, async context bookkeeping and Promise settlement observation cost time. The work cohort demonstrates invocation counts on the same host/session/input policy; it does not imply those counters were captured inside an uninstrumented timing sample. Product parity between the two builds is an integration gate still to run in the complete hosts.

## Semantics and limits

`createObserver().wrapCall` passes the original receiver and argument references to `Reflect.apply`, returns the exact synchronous value or original native Promise, and rethrows the original synchronous error. It never awaits a call, replaces a rejection or serializes concurrent work. Native Promise settlements have a nonthrowing accounting observer; foreign thenables are not assimilated. No getter on a user request/result is used to obtain metadata. An observer sink failure marks the trace invalid but does not replace the application's result/error. There is no instrumentation-driven cancellation or scheduling decision.

Factory wrappers decorate actual returned service instances. Instance identity and private fields survive; method identity/reflection changes are confined to this instrumented cohort. Constructor wrapping preserves subclass `new.target` and the original class instance behavior. Graph's existing `onObserve` telemetry option is the one deliberate argument adaptation: a copied options object composes the observer with the original callback, preserving the original callback's receiver, arguments, result and errors. Caller options are not mutated. No analogous filesystem mutation hook is injected: adding an awaited hook there would alter the committer's scheduling.

| Event/method                                                                           | What the count means                                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `compiler.compile`                                                                     | An actual attempt, with generation/mode/origin inherited through AsyncLocalStorage in that process                                      |
| `discovery.discover`, `semantic.synchronize/enumerateApi/describeGuide/renderFragment` | Actual service invocations, separately named; nested categories must not be summed as equivalent units                                  |
| `content.describe/compile/link`                                                        | Actual metadata/heavy-content/link calls; input ID/kind and settlement diagnostics separate work attempted from successful output       |
| `cache.read` result `hit`/`miss`, `cache.write`                                        | Real validated cache decisions and write calls, not inferred duration or artifact count                                                 |
| `dependency.refresh`                                                                   | Refresh invocations, which can reuse observations                                                                                       |
| `physical-observation`                                                                 | Actual deduplicated content/existence/glob observation **attempt** via the existing callback; not a count of every OS syscall           |
| `template.render`                                                                      | Actual template service invocations; not every internal Markdown/Shiki operation                                                        |
| `committer.commit`                                                                     | Real commit outcome; `written`/`removed` are successful committed product-path counts, not all staging/rollback/manifest syscall counts |

The observer does not count full-index JSON serialization, every internal cache write, Angular compilations, browser work or all filesystem operations. Preserve public `whyRebuilt` separately as causal metadata. Return diagnostics may contain an error while the function itself fulfils: raw records retain diagnostic codes, and a `return` count alone is not a successful-render count. The trace reader aggregates basic invocation/settlement/cache-status counts; detailed generation/content/error attribution remains in raw events.

Each bundled runtime instance writes a unique PID/UUID JSONL file, so multiple entries in one process do not collide. Files are streamed using short synchronous appends, capped at 64 MiB each; no full snapshots or artifacts are retained in memory. Overflow/sink failure is a failed work cohort, never silent sampled counts. Terminal records are emitted on process exit, including worker exit. Unexpected process death may prevent a terminal record and must not be accepted as complete accounting.

## Validation boundary

Tests cover receiver/argument/value/error/Promise identity, concurrent contexts, non-assimilated thenables/accessors, throwing sinks, private fields and idempotent decoration; actual esbuild/service execution and product bytes; source drift/unreached-module rejection; and missing/foreign/truncated/failed/unpaired trace refusal. Source guards fail before the private build if its declared targeted hashes drift.

Still pending: a private full-entry build integration, observed-vs-unobserved full-host product parity, and per-host cohorts (Angular CLI builders, Vite host) with supervisor PID verification. Legacy uses its separately reviewed baseline overlay and needs equivalent counter definitions there; this plugin does not claim to instrument legacy stores.
