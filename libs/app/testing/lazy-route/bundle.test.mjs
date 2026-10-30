// Checks the production build of the lazy-route fixture (`nx run app:test-lazy-route` builds it
// first): an application that holds NgDoc only in a lazy route keeps the NgDoc runtime, Shiki and
// Orama out of the chunks it loads at start, and the documentation route keeps Shiki and Orama
// out of its own chunks, loading them on demand.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const STATS = join(process.cwd(), 'dist/fixtures/app-lazy-route/browser-stats.json');
const FIXTURE = 'libs/app/testing/lazy-route/fixture';

/**
 * Inputs that belong to NgDoc's runtime: the libraries the docs application is made of, not the
 * fixture itself (which lives in a testing folder of `libs/app`).
 */
const NG_DOC_RUNTIME = /(^|\/)libs\/(app|ui-kit|core)\/(?!testing\/)/;
/** Inputs of the libraries that load on demand. */
const HEAVY = {
  Shiki: /\/node_modules\/(shiki|@shikijs\/[^/]+)\//,
  Orama: /\/node_modules\/@orama\/[^/]+\//,
};

/**
 * Reads the esbuild metafile that `statsJson` writes next to the browser output.
 * @returns {{ outputs: Record<string, { entryPoint?: string, imports: Array<{ path: string, kind: string }>, inputs: Record<string, { bytesInOutput: number }> }> }}
 */
function readStats() {
  assert.ok(
    existsSync(STATS),
    `${STATS} is missing: run "nx run app:build-lazy-route-fixture" first (test-lazy-route does).`,
  );

  return JSON.parse(readFileSync(STATS, 'utf8'));
}

const stats = readStats();

/**
 * The output chunk built for an entry module.
 * @param {string} entry - The entry module, relative to the workspace.
 */
function chunkOf(entry) {
  const name = Object.keys(stats.outputs).find(
    (output) => stats.outputs[output].entryPoint === entry,
  );

  assert.ok(name, `no output chunk for ${entry}`);

  return name;
}

/**
 * The chunks a browser loads with a chunk: the chunk and everything it imports statically.
 * @param {string} chunk - Output chunk name.
 */
function staticClosure(chunk) {
  const seen = new Set();
  const pending = [chunk];

  while (pending.length) {
    const current = pending.pop();

    if (seen.has(current)) continue;
    seen.add(current);
    stats.outputs[current].imports
      .filter((imported) => imported.kind === 'import-statement' && imported.path in stats.outputs)
      .forEach((imported) => pending.push(imported.path));
  }

  return [...seen];
}

/**
 * The source modules that contribute code to the given chunks.
 * @param {string[]} chunks - Output chunk names.
 */
function inputsOf(chunks) {
  return chunks.flatMap((chunk) =>
    Object.entries(stats.outputs[chunk].inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([input]) => input),
  );
}

/** Every source module of the build that contributes code. */
const allInputs = inputsOf(Object.keys(stats.outputs));

describe('NgDoc under a lazy route', () => {
  const initial = inputsOf(staticClosure(chunkOf(`${FIXTURE}/main.ts`)));
  const docs = inputsOf(staticClosure(chunkOf(`${FIXTURE}/docs/docs.routes.ts`)));

  it('loads the documentation route on demand', () => {
    const main = stats.outputs[chunkOf(`${FIXTURE}/main.ts`)];

    assert.ok(
      main.imports.some(
        (imported) =>
          imported.kind === 'dynamic-import' &&
          imported.path === chunkOf(`${FIXTURE}/docs/docs.routes.ts`),
      ),
    );
    assert.ok(initial.some((input) => input.startsWith(`${FIXTURE}/`)));
  });

  it('keeps the NgDoc runtime out of the initial chunks', () => {
    assert.deepEqual(
      initial.filter((input) => NG_DOC_RUNTIME.test(input)),
      [],
    );
    // The documentation route holds it, so the check above can fail.
    assert.ok(docs.some((input) => NG_DOC_RUNTIME.test(input)));
  });

  for (const [name, pattern] of Object.entries(HEAVY)) {
    it(`keeps ${name} out of the initial chunks and loads it on demand`, () => {
      assert.ok(
        allInputs.some((input) => pattern.test(input)),
        `${name} is not in the build at all`,
      );
      assert.deepEqual(
        initial.filter((input) => pattern.test(input)),
        [],
      );
      assert.deepEqual(
        docs.filter((input) => pattern.test(input)),
        [],
      );
    });
  }
});
