# Real generator → Angular verification

`run.mjs` creates an isolated temporary documentation workspace, bundles and invokes the real generator compilation service, commits its candidate through the real artifact committer, and then loads the committed Angular modules with Vite and the Analog Angular plugin in AOT/strict-template mode.

Run from the repository root with the pinned Node runtime:

```sh
PATH=/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
CI=1 NX_DAEMON=false NX_NO_CLOUD=true NX_TUI=false \
node libs/builder/testing/generator-angular/run-bounded.mjs
```

The supervisor bounds the complete run to 180 seconds and terminates its process group on expiry. The harness owns a dynamically allocated loopback port and removes its `.runtime` fixture in `finally`. Set `KEEP_GENERATOR_ANGULAR_FIXTURE=1` only for local debugging.
