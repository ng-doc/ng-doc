/** @vitest-environment node */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import type { DiscoveryRequest } from '../../contracts';
import { DiscoveryServiceImpl } from '..';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

it('keeps real concurrent-import discovery provenance stable, preserving ordered config and actual invalidation', async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-discovery-order-')));
  const service = new DiscoveryServiceImpl();
  const write = (file: string, text: string) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { target: 'ES2022', moduleResolution: 'node' } }),
  );
  write('leaf.ts', 'export const suffix = "original";');
  const imports: string[] = [];
  for (let i = 0; i < 24; i++) {
    const depth = (i % 7) + 1;
    for (let level = 0; level < depth; level++) {
      const next = level + 1 === depth ? '../leaf' : `./branch-${i}-${level + 1}`;
      write(
        `values/branch-${i}-${level}.ts`,
        `import {suffix} from '${next}'; export {suffix}; export const noise = [${Array.from({ length: (i + 1) * 150 }, (_, n) => n).join(',')}];`,
      );
    }
    write(
      `values/value-${i}.ts`,
      `import {suffix} from './branch-${i}-0'; export const value${i} = 'value-${i}-' + suffix;`,
    );
    imports.push(`import {value${i}} from './values/value-${i}';`);
    write(
      `docs/page-${i}/ng-doc.page.ts`,
      `import {value${i}} from '../../values/value-${i}'; const Page={title:value${i},mdFile:'./page.md'}; export default Page;`,
    );
    write(`docs/page-${i}/page.md`, `# Page ${i}`);
  }
  write(
    'ng-doc.config.ts',
    `${imports.join('\n')}\nexport default {docsPath:'docs',guide:{anchorHeadings:['h3','h1']},keywords:{loaders:[async function fixedLoader(){return {fixed:{url:'/fixed'}};}]},routePrefix:[${Array.from({ length: 24 }, (_, i) => `value${i}`).join(',')}].join('/')};`,
  );
  const request: DiscoveryRequest = {
    generation: 1,
    changes: [],
    projectId: 'order',
    workspaceRoot: root,
    configFile: path.join(root, 'ng-doc.config.ts'),
    defaults: {
      docsRoot: path.join(root, 'docs'),
      tsConfig: path.join(root, 'tsconfig.json'),
      outputRoot: path.join(root, 'generated'),
      cacheRoot: path.join(root, 'cache'),
    },
  };
  const runs: Array<{
    configurationDigest: string;
    dependencySet: string;
    dependencyOrder: string;
    executableInput: string;
    anchors: string[];
    routePrefix: string;
  }> = [];
  try {
    for (let i = 0; i < 12; i++) {
      const result = await service.discover(
        { ...request, generation: i + 1 },
        new AbortController().signal,
      );
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      if (!result.value) throw new Error('Missing real discovery result');
      runs.push({
        configurationDigest: result.value.configuration.digest,
        dependencySet: hash(result.dependencies.map((d) => JSON.stringify(d)).sort()),
        dependencyOrder: hash(result.dependencies),
        executableInput: result.value.configuration.executables[0]!.inputDigest,
        anchors: result.value.configuration.anchorHeadings,
        routePrefix: result.value.configuration.routePrefix,
      });
    }
    const evidence = process.env.NGDOC_DETERMINISM_EVIDENCE;
    if (evidence) writeFileSync(evidence, JSON.stringify({ runs }, null, 2) + '\n');
    expect(new Set(runs.map((r) => r.dependencySet)).size).toBe(1);
    expect(new Set(runs.map((r) => r.configurationDigest)).size).toBe(1);
    expect(new Set(runs.map((r) => r.executableInput)).size).toBe(1);
    expect(runs.every((r) => JSON.stringify(r.anchors) === '["h3","h1"]')).toBe(true);
    write('leaf.ts', 'export const suffix = "original"; // changed dependency bytes only');
    const changed = await service.discover(
      { ...request, generation: 13 },
      new AbortController().signal,
    );
    expect(changed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(changed.value!.configuration.routePrefix).toBe(runs[0]!.routePrefix);
    expect(changed.value!.configuration.digest).not.toBe(runs[0]!.configurationDigest);
    expect(changed.value!.configuration.executables[0]!.inputDigest).not.toBe(
      runs[0]!.executableInput,
    );
    if (evidence)
      writeFileSync(
        evidence,
        JSON.stringify(
          {
            runs,
            changed: {
              configurationDigest: changed.value!.configuration.digest,
              executableInput: changed.value!.configuration.executables[0]!.inputDigest,
              settingsUnchanged: changed.value!.configuration.routePrefix === runs[0]!.routePrefix,
            },
          },
          null,
          2,
        ) + '\n',
      );
  } finally {
    await service.dispose();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
