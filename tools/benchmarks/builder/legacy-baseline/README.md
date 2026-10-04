# Corrected legacy baseline overlay

This harness measures correctness before any timing work. It copies the built legacy builder package into a temporary directory, transpiles the files under `overlay/` over that copy, and runs the real legacy generator in fresh child processes. It never writes to `libs/builder` or `dist/libs/builder`.

Run it with Node 24:

```sh
PATH=/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
CI=1 NX_DAEMON=false NX_NO_CLOUD=true NX_TUI=false \
NGDOC_LEGACY_BASELINE_EVIDENCE="$PWD/tmp/benchmarks/legacy-baseline" \
node tools/benchmarks/builder/legacy-baseline/run.mjs
```

The overlay intentionally keeps the expensive content cache. It removes only outer `skip` caches whose replay omitted aggregate store side effects, then makes aggregate routes/search/keyword serialization stable. Native API membership is re-enumerated only for files matched by an API scope. Page deletion removes the page-owned output directory. A reported builder error rejects the child process rather than being logged as success.

The harness checks exact normalized cold/warm output equality, a same-process Markdown edit and restore with unaffected sibling outputs, native outside-docs API glob creation and deletion, native page-directory deletion, a malformed-template natural failure followed by a clean repair, joined watcher cleanup, and before/after hashes of every original file represented by the overlay.
