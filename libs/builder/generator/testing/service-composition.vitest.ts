import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

import { createArtifactCache } from '../artifacts';
import { GeneratorContentCompiler } from '../content/content-compiler';
import type { PageArtifact } from '../contracts';
import { createDiscoveryServices } from '../discovery';
import { createSemanticService } from '../semantic/semantic-service';

test('real discovery/semantic/content results compose and survive strict artifact cache', async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-service-composition-')));
  const file = (relative: string, content: string) => {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const tsConfig = file(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
  );
  const config = file(
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', guide: { anchorHeadings: ['h1', 'h2'] } };`,
  );
  file(
    'docs/ng-doc.api.ts',
    `/** API index description */\nconst api = { title: 'API', route: 'api', scopes: [{ name: 'public', route: 'public', include: ['docs/api.ts'] }] }; export default api;`,
  );
  file(
    'docs/api.ts',
    '/** Actual class description. */\nexport class Actual { /** A value. */ value = 1; }',
  );
  file(
    'docs/guide/ng-doc.page.ts',
    `/** Guide header description. */\nconst page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
  );
  file('docs/guide/index.md', '---\nkeyword: Guide\n---\n# Heading\n\nA linked `Actual` and body.');
  const discovery = createDiscoveryServices();
  const semantic = createSemanticService({
    readGuideValues: discovery.values.readGuideValues.bind(discovery.values),
  });
  const signal = new AbortController().signal;
  try {
    const found = await discovery.discovery.discover(
      {
        generation: 1,
        projectId: 'fixture',
        workspaceRoot: root,
        configFile: config,
        defaults: {
          docsRoot: path.join(root, 'docs'),
          tsConfig,
          outputRoot: path.join(root, 'out'),
          cacheRoot: path.join(root, 'cache'),
        },
        changes: [],
      },
      signal,
    );
    expect(found.diagnostics).toEqual([]);
    expect(found.value).toBeDefined();
    const sync = await semantic.synchronize(
      { generation: 1, discovery: found.value!, changes: [] },
      signal,
    );
    expect(sync.diagnostics).toEqual([]);
    const content = new GeneratorContentCompiler({
      configuration: found.value!.configuration,
      templates: discovery.templates,
      semantic,
    });
    const api = found.value!.entries.find((entry) => entry.kind === 'api')!;
    const guide = found.value!.entries.find((entry) => entry.kind === 'guide')!;
    if (guide.kind !== 'guide' || api.kind !== 'api') throw new Error('fixture discovery kind');
    const declarations = semantic.enumerateApi(api.id);
    expect(declarations.diagnostics).toEqual([]);
    expect(declarations.value).toHaveLength(1);
    const declaration = declarations.value![0];
    const requests = [
      { kind: 'header' as const, id: 'api-header', entry: api },
      { kind: 'header' as const, id: 'guide-header', entry: guide },
      { kind: 'header' as const, id: 'declaration-header', entry: declaration },
      {
        kind: 'guide-tab' as const,
        id: 'guide-content',
        entry: guide,
        markdown: guide.markdown[0],
      },
      { kind: 'api-tab' as const, id: 'api-content', declaration },
    ];
    const cache = createArtifactCache(path.join(root, 'cache'));
    for (const request of requests) {
      const result = await content.compile(request, signal);
      expect(result.diagnostics, request.id).toEqual([]);
      expect(result.value, request.id).toBeDefined();
      expect(JSON.parse(JSON.stringify(result.value)), request.id).toStrictEqual(result.value);
      const linked = await content.link(
        {
          ir: result.value!,
          keywords: declaration.exportedKeywords,
          breadcrumbs: ['Fixture'],
          pageType: request.id.startsWith('guide') ? 'guide' : 'api',
        },
        signal,
      );
      expect(linked.diagnostics, request.id).toEqual([]);
      expect(linked.value).toBeDefined();
      const artifact: PageArtifact = {
        id: request.id,
        identity: {
          projectId: 'fixture',
          entryId: result.value!.entryId,
          role: 'content',
          part: request.id,
        },
        revision: '1',
        fingerprint: {
          schemaVersion: 4,
          compilerVersion: 'fixture',
          toolchainDigest: 'fixture',
          configurationDigest: 'fixture',
          inputDigest: 'fixture',
          keywordDigest: linked.value!.keywordDigest,
        },
        dependencies: result.dependencies,
        content: [linked.value!],
        exportedKeywords: result.value!.exportedKeywords,
        usedKeywords: result.value!.usedKeywords,
        searchRecords: linked.value!.searchRecords,
        routes: [],
        apiList: [],
        outputs: [],
        diagnostics: [],
      };
      await cache.write(artifact);
      const restored = await cache.read({
        identity: artifact.identity,
        fingerprint: artifact.fingerprint,
      });
      expect(restored.status, request.id).toBe('hit');
    }
  } finally {
    await semantic.dispose();
    await discovery.runtime.dispose();
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
