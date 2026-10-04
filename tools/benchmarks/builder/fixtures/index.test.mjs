import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseTemplate } from '@angular/compiler';
import ts from 'typescript';

import { INVALID_CONTENT_MARKER, writeFixture } from './index.mjs';

async function files(root, prefix = '') {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...(await files(root, relative)));
    else if (relative !== 'fixture-manifest.json') result.push(relative.replaceAll(path.sep, '/'));
  }
  return result.sort();
}

async function snapshot(root) {
  const output = {};
  for (const relative of await files(root))
    output[relative] = await readFile(path.join(root, relative), 'utf8');
  return output;
}

test('writes deterministic real workspace and edit metadata', async () => {
  const first = await mkdtemp(path.join(tmpdir(), 't19-fixture-a-'));
  const second = await mkdtemp(path.join(tmpdir(), 't19-fixture-b-'));
  try {
    const a = await writeFixture(first, { guides: 100, apiDeclarations: 1000 });
    const b = await writeFixture(second, { guides: 100, apiDeclarations: 1000 });
    assert.deepEqual(a, b);
    assert.deepEqual(await snapshot(first), await snapshot(second));
    assert.equal(a.expected.guideRoutes, 100);
    assert.equal(a.expected.apiDeclarations, 1000);
    assert.equal(a.expected.apiFiles, 20);
    assert.equal(a.sharedFanout.length, 20);
    assert.match(
      await readFile(path.join(first, a.editPaths.localBody), 'utf8'),
      /Benchmark guide 1/,
    );
    assert.match(
      await readFile(path.join(first, a.editPaths.apiContent), 'utf8'),
      /export (class|interface|function|type)/,
    );
    assert.match(
      await readFile(path.join(first, a.negative.path), 'utf8'),
      new RegExp(INVALID_CONTENT_MARKER),
    );
    assert.match(
      await readFile(path.join(first, 'docs/category-01/section/guide-0001/page.md.nunj'), 'utf8'),
      /NgDocActions\.demo/,
    );
    assert.match(
      await readFile(
        path.join(first, 'docs/category-01/section/guide-0001/ng-doc.page.ts'),
        'utf8',
      ),
      /BenchmarkDemo/,
    );
    assert.doesNotMatch(
      await readFile(path.join(first, 'docs/category-02/section/guide-0002/page.md.nunj'), 'utf8'),
      /shared\/header/,
    );
    assert.match(
      await readFile(path.join(first, 'docs/api/ng-doc.api.ts'), 'utf8'),
      /src\/api\/\*\*\/\*\.ts/,
    );
    const apiText = (
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          readFile(path.join(first, `src/api/api-${String(i + 1).padStart(2, '0')}.ts`), 'utf8'),
        ),
      )
    ).join('\n');
    assert.equal((apiText.match(/^export /gm) ?? []).length, 1000);
    assert.match(apiText, /class BenchmarkApi0008 extends BenchmarkApi0004/);
    const apiProgram = ts.createProgram(
      Array.from({ length: 20 }, (_, i) =>
        path.join(first, `src/api/api-${String(i + 1).padStart(2, '0')}.ts`),
      ),
      {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        strict: true,
        skipLibCheck: true,
      },
    );
    assert.deepEqual(
      ts.getPreEmitDiagnostics(apiProgram),
      [],
      'generated API declarations must type-check',
    );
    assert.equal(a.expected.apiIdentities.length, 1000);
    assert.match(await readFile(path.join(first, 'src/app.ts'), 'utf8'), /NgDocRootComponent/);
    const appSource = await readFile(path.join(first, 'src/app.ts'), 'utf8');
    const appTemplate = appSource.match(/template:'([^']+)'/)?.[1];
    assert.ok(appTemplate);
    assert.deepEqual(parseTemplate(appTemplate, 'fixture-app.ts').errors ?? [], []);
    assert.match(await readFile(path.join(first, 'src/providers.ts'), 'utf8'), /NG_DOC_ROUTING/);
    assert.match(
      await readFile(path.join(first, 'src/main.server.ts'), 'utf8'),
      /withNgDocContentReady/,
    );
    assert.match(
      await readFile(path.join(first, 'docs/category-01/section/ng-doc.category.ts'), 'utf8'),
      /category:parent/,
    );
    assert.match(
      await readFile(path.join(first, a.negative.path), 'utf8'),
      /missing-required-include/,
    );
    assert.equal(a.foreground.route, '/preview/docs/category-01/section-01/guide-0001');
    assert.equal(a.expected.guideKeywords.length, 100);
  } finally {
    await Promise.all([
      rm(first, { recursive: true, force: true }),
      rm(second, { recursive: true, force: true }),
    ]);
  }
});

test('rejects unsupported sizes and malformed options before writing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 't19-fixture-invalid-'));
  try {
    await assert.rejects(writeFixture(root, { guides: 101 }), /guides must be one of/);
    await assert.rejects(
      writeFixture(root, { guides: 100, apiDeclarations: -1 }),
      /apiDeclarations/,
    );
    await assert.rejects(writeFixture(root, { guides: 100, seed: '/absolute' }), /seed/);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
