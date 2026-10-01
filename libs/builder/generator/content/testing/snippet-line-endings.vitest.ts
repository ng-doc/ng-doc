import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentCompilerServices } from '../../contracts';
import { GeneratorContentCompiler } from '../content-compiler';

// Windows: the platform line ending is CRLF. Line ranges must not depend on it.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, EOL: '\r\n', default: { ...actual, EOL: '\r\n' } };
});

function services(root: string): ContentCompilerServices {
  return {
    configuration: {
      projectId: 'test',
      workspaceRoot: root,
      docsRoots: [root],
      tsConfig: path.join(root, 'tsconfig.json'),
      outputRoot: path.join(root, 'out'),
      cacheRoot: path.join(root, 'cache'),
      routePrefix: 'docs',
      guideDirectory: 'guides',
      apiDirectory: 'api',
      assetDirectory: 'assets',
      inlineStyleLanguage: 'CSS',
      anchorHeadings: ['h1', 'h2'],
      themes: { light: 'github-light', dark: 'ayu-dark' },
      cacheEnabled: false,
      digest: 'config',
      executables: [],
    },
    templates: {
      render: (request) => ({ value: request.text, dependencies: [], diagnostics: [] }),
    },
    semantic: {
      synchronize: async () => ({ value: null, dependencies: [], diagnostics: [] }),
      enumerateApi: () => ({ dependencies: [], diagnostics: [] }),
      describeGuide: () => ({
        value: { demos: {}, playgrounds: [] },
        dependencies: [],
        diagnostics: [],
      }),
      renderFragment: () => ({
        value: { format: 'html', value: '<p>fragment</p>' },
        dependencies: [],
        diagnostics: [],
      }),
      dispose: async () => {},
    },
  } as ContentCompilerServices;
}

describe('line-ranged snippets on a CRLF platform', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'content.eol.'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  async function render(snippet: string): Promise<string> {
    expect(os.EOL).toBe('\r\n');
    fs.writeFileSync(path.join(root, 'range.ts'), snippet);
    const markdown = path.join(root, 'ranges.md');
    fs.writeFileSync(markdown, '```ts file="range.ts"#L2-L3\nfallback\n```\n');
    const result = await new GeneratorContentCompiler(services(root)).compile(
      {
        kind: 'guide-tab',
        id: 'ranges',
        entry: {
          id: 'guide',
          kind: 'guide',
          source: { path: path.join(root, 'guide.ts') },
          title: 'Guide',
          route: 'guide',
          absoluteRoute: 'docs/guide',
          breadcrumbs: ['Guide'],
          runtimeImport: { source: path.join(root, 'guide.ts'), exportName: 'default' },
          dependencies: [],
          markdown: [markdown],
          hasImports: false,
        },
        markdown,
      },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
    return result.value!.html;
  }

  it('selects the same lines of an LF file as on POSIX', async () => {
    const html = await render(
      ['zeroLine();', 'firstLine();', 'secondLine();', 'thirdLine();'].join('\n'),
    );
    expect(html).toContain('firstLine');
    expect(html).toContain('secondLine');
    expect(html).not.toContain('zeroLine');
    expect(html).not.toContain('thirdLine');
  });

  it('selects the same lines of a CRLF file', async () => {
    const html = await render(
      ['zeroLine();', 'firstLine();', 'secondLine();', 'thirdLine();'].join('\r\n'),
    );
    expect(html).toContain('firstLine');
    expect(html).toContain('secondLine');
    expect(html).not.toContain('zeroLine');
    expect(html).not.toContain('thirdLine');
  });
});
