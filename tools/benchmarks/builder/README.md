# NgDoc builder benchmark preparation

This directory is an **unfinished benchmark harness**. No final performance matrix or default decision has been accepted. The protocol is in `docs/architecture/evidence/t19/benchmark-protocol.md`.

Implemented pieces:

- `fixtures/`: deterministic common real Angular/NgDoc inputs, nested categories, demo interaction, shared includes, API declarations and edit metadata. Actual Angular template parsing and TypeScript API diagnostics supplement source inventory tests.
- `legacy-baseline/`: isolated corrected legacy copy; production sources remain unchanged. Its specific regression gate is separate from full-host qualification.
- `supervisor.mjs`: exclusive POSIX consumer lease, spawn-to-product clock, process-tree RSS, bounded logs/deadline, verified descendant ownership and bounded cleanup. Failed cleanup retains the lease.
- `statistics.mjs`: strict cohort/admission rules, descriptive median/nearest-rank p95 and spread. Invalid samples are retained and excluded, never silently dropped.
- `host/` and `pilot.mjs`: real Vite-host startup pilots on the 100-guide workload with browser/demo/index checks. They are not complete product, production, edit, or benchmark oracles.
- `observer/` and `observed-build.mjs`: separately instrumented private runtime for actual work traces. It is never used as a primary timing cohort.

Use Node 24.19.0 and the exact accepted lockfile. Example correctness pilot (paths must be absolute and fresh; run from the modernization checkout):

```sh
NGDOC_EXPECTED_SOURCE_DIGEST=<accepted-built-source-digest> \
  caffeinate -i -s node tools/benchmarks/builder/pilot.mjs \
  --mode c --root <checkout>/tmp/fresh-pilot \
  --evidence <checkout>/docs/architecture/evidence/t19/fresh-pilot
```

The virtual content mode (`--mode c-d`) was removed. `--observed` privately rebuilds all generator entries with the work observer and keeps the trace cohort separate. `--warm` currently supports pilot restarts only; full warm manifest/cache admission is still required before benchmark use. Keep retained runtime/cache trees for diagnosis until they are explicitly removed.

Tests:

```sh
node --test tools/benchmarks/builder/testing/*.test.mjs \
  tools/benchmarks/builder/fixtures/index.test.mjs \
  tools/benchmarks/builder/observer/observer.test.mjs
```

Remaining: independent baseline qualification, equivalent Angular baseline/Angular CLI host, complete input/product oracles, edit/production drivers, full-current-app preparation, complete instrumented/uninstrumented parity and PID proof, preregistered serial repetitions, performance investigation, report and decision record. Native cross-OS qualification remains a separate pending gate.
