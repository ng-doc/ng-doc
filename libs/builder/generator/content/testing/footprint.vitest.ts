import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nunjucks from 'nunjucks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ContentCompilerServices,
  DeclarationDescriptor,
  JsonValue,
  ServiceResult,
  TemplateActions,
  TemplateEvaluationService,
  TemplateRequest,
} from '../../contracts';
import { attachFootprint, footprintOf, SEMANTIC_RECORDER_ENV } from '../../kernel/footprint';
import { GeneratorContentCompiler } from '../content-compiler';

/** Content describe, compile and link each record one footprint, and change nothing else. */

const configuration = {
  projectId: 'test',
  workspaceRoot: '/',
  docsRoots: ['/'],
  tsConfig: '/tsconfig.json',
  outputRoot: '/out',
  cacheRoot: '/cache',
  routePrefix: 'docs',
  guideDirectory: 'guides',
  apiDirectory: 'api',
  assetDirectory: 'assets',
  inlineStyleLanguage: 'CSS' as const,
  anchorHeadings: ['h1', 'h2'] as Array<'h1' | 'h2'>,
  themes: { light: 'github-light', dark: 'ayu-dark' },
  cacheEnabled: false,
  digest: 'config',
  executables: [],
};

const templates: TemplateEvaluationService = {
  render(request: TemplateRequest, actions: TemplateActions) {
    const env = new nunjucks.Environment(undefined, { autoescape: false });
    const bind = (namespace: string, names: string[]) =>
      Object.fromEntries(
        names.map((name) => [
          name,
          (...args: JsonValue[]) => actions.invoke(namespace as never, name, args),
        ]),
      );
    env.addGlobal('NgDocActions', bind('NgDocActions', ['demo', 'playground']));
    env.addGlobal('NgDocApi', bind('NgDocApi', ['api']));
    env.addGlobal('JSDoc', bind('JSDoc', ['description']));
    return {
      value: env.renderString(request.text, {
        ...request.values,
        NgDocPage: { title: request.values.title },
      }),
      dependencies: [],
      diagnostics: [],
    };
  },
};

/** A semantic port whose results carry footprints, as the real service's do. */
function services(): ContentCompilerServices {
  const recorded = <T>(
    result: ServiceResult<T>,
    scope: 'describeGuide' | 'renderFragment' | 'entry-doc',
    file: string,
  ): ServiceResult<T> =>
    attachFootprint(result, {
      scope,
      key: file,
      files: [file],
      reads: [`${file}.read`],
      complete: true,
    });
  return {
    configuration,
    templates,
    semantic: {
      synchronize: async () => ({ value: null, dependencies: [], diagnostics: [] }),
      enumerateApi: () => ({ dependencies: [], diagnostics: [] }),
      describeGuide: () =>
        recorded(
          {
            value: {
              demos: { Demo: [] },
              playgrounds: [
                {
                  id: 'Play',
                  target: { source: '/missing-play.ts', exportName: 'Play' },
                  standalone: true,
                  selector: 'play',
                  template: '',
                  templatesBySelector: {},
                  properties: {},
                  content: {},
                },
              ],
            },
            dependencies: [],
            diagnostics: [],
          },
          'describeGuide',
          '/guide-semantics.ts',
        ),
      renderFragment: (request) =>
        request.kind === 'entry-doc'
          ? recorded(
              {
                value: { format: 'value', value: { description: 'd', tags: {} } },
                dependencies: [],
                diagnostics: [],
              },
              'entry-doc',
              '/entry.ts',
            )
          : recorded(
              {
                value: { format: 'html', value: `<p>${request.kind}</p>` },
                dependencies: [{ kind: 'content', path: '/api.ts', digest: 'x' }],
                diagnostics: [],
              },
              'renderFragment',
              `/${request.kind}.ts`,
            ),
      dispose: async () => {},
    },
  };
}

const declaration: DeclarationDescriptor = {
  id: 'decl',
  apiEntryId: 'api-entry',
  scopeId: 'scope',
  source: { path: '/api.ts' },
  name: 'Thing',
  kind: 'class',
  route: 'api/thing',
  breadcrumbs: ['API'],
  exportedKeywords: [{ key: 'Thing', title: 'Thing', path: 'api/thing' }],
};

describe('content footprints', () => {
  let root: string;
  let previous: string | undefined;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'content.footprint.'));
    previous = process.env[SEMANTIC_RECORDER_ENV];
  });
  afterEach(() => {
    if (previous === undefined) delete process.env[SEMANTIC_RECORDER_ENV];
    else process.env[SEMANTIC_RECORDER_ENV] = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const entry = (markdown: string) => ({
    id: 'guide',
    kind: 'guide' as const,
    source: { path: path.join(root, 'guide.ts') },
    title: 'Guide',
    route: 'guide',
    absoluteRoute: 'docs/guide',
    breadcrumbs: ['Guide'],
    runtimeImport: { source: path.join(root, 'guide.ts'), exportName: 'default' },
    dependencies: [],
    markdown: [markdown],
    hasImports: false,
  });

  /** Every phase call of one guide and one API page, run with a compiler in the given mode. */
  async function phases(mode: string | undefined) {
    if (mode === undefined) delete process.env[SEMANTIC_RECORDER_ENV];
    else process.env[SEMANTIC_RECORDER_ENV] = mode;
    const compiler = new GeneratorContentCompiler(services());
    const signal = new AbortController().signal;
    const markdown = path.join(root, 'page.md');
    const provenance = (ownerId: string, ordinal: number, closureIds: string[]) => ({
      ownerId,
      ordinal,
      ownerInputDigest: 'owner',
      compilerVersion: 'compiler',
      toolchainDigest: 'toolchain',
      configurationDigest: configuration.digest,
      closureIds,
    });
    const id = `owner:tab:${createHash('sha256').update(JSON.stringify(markdown)).digest('hex')}`;
    const guide = { kind: 'guide-tab' as const, id, entry: entry(markdown), markdown };
    const described = await compiler.describe(
      guide,
      provenance('owner', 1, ['owner:header']),
      signal,
    );
    const tab = await compiler.compile({ ...guide, id: 'tab' }, signal);
    const api = await compiler.compile({ kind: 'api-tab', id: 'api', declaration }, signal);
    const apiHeader = await compiler.compile(
      { kind: 'header', id: 'api-header', entry: declaration },
      signal,
    );
    const header = await compiler.compile(
      { kind: 'header', id: 'header', entry: entry(markdown) },
      signal,
    );
    const linked = await compiler.link(
      { ir: tab.value!, keywords: [], breadcrumbs: ['Guide'], pageType: 'guide' },
      signal,
    );
    return { described, tab, api, apiHeader, header, linked, markdown };
  }

  it('records reads and merges the semantic footprints of every query a compile makes', async () => {
    fs.writeFileSync(
      path.join(root, 'page.md'),
      '# Page\n\n{{ NgDocActions.demo("Demo") }}\n{{ NgDocActions.playground("Play") }}\n{{ NgDocApi.api("api.ts#Thing") }}\n{{ JSDoc.description("api.ts#Thing") }}\n\n```ts file="./snippet.ts"\n```\n',
    );
    fs.writeFileSync(path.join(root, 'snippet.ts'), 'export const snippet = 1;');
    const { described, tab, api, apiHeader, header, linked, markdown } = await phases(undefined);
    expect(tab.diagnostics.map((item) => item.code)).toEqual(['CONTENT_PLAYGROUND_SOURCE']);
    expect(described.diagnostics).toEqual([]);
    expect(footprintOf(described)).toEqual({
      scope: 'content-describe',
      key: expect.stringMatching(/^owner:tab:[a-f0-9]{64}$/),
      files: [],
      complete: true,
      reads: [markdown],
    });
    expect(footprintOf(tab)).toEqual({
      scope: 'content-compile',
      key: 'tab',
      files: ['/api.ts', '/guide-semantics.ts', '/js-doc.ts'],
      complete: true,
      reads: expect.arrayContaining([
        markdown,
        path.join(root, 'snippet.ts'),
        '/missing-play.ts',
        '/api.ts',
        '/guide-semantics.ts.read',
        '/api.ts.read',
        '/js-doc.ts.read',
      ]),
    });
    expect(footprintOf(api)).toMatchObject({ scope: 'content-compile', files: ['/api-page.ts'] });
    expect(footprintOf(apiHeader)).toMatchObject({ files: ['/api-header.ts'] });
    expect(footprintOf(header)).toMatchObject({ files: ['/entry.ts'] });
    expect(footprintOf(linked)).toEqual({
      scope: 'link',
      key: 'tab',
      files: [],
      reads: [],
      complete: true,
    });
  });

  it('records nothing when the recorder is off, and every result is unchanged', async () => {
    fs.writeFileSync(
      path.join(root, 'page.md'),
      '# Page\n\n{{ NgDocApi.api("api.ts#Thing") }}\n\n```ts file="./snippet.ts"\n```\n',
    );
    fs.writeFileSync(path.join(root, 'snippet.ts'), 'export const snippet = 1;');
    const on = await phases('1');
    const off = await phases('0');
    for (const result of Object.values(off))
      if (typeof result === 'object') expect(footprintOf(result)).toBeUndefined();
    const { markdown: _on, ...onResults } = on;
    const { markdown: _off, ...offResults } = off;
    expect(JSON.stringify(onResults)).toBe(JSON.stringify(offResults));
  });
  it('marks a footprint incomplete when a semantic query recorded nothing', async () => {
    const local = services();
    // A semantic port that reports no footprint (recording off or unavailable on its side).
    local.semantic = {
      ...local.semantic,
      renderFragment: (request) => ({
        value: { format: 'html', value: `<p>${request.kind}</p>` },
        dependencies: [],
        diagnostics: [],
      }),
    };
    const compiled = await new GeneratorContentCompiler(local).compile(
      { kind: 'api-tab', id: 'api', declaration },
      new AbortController().signal,
    );
    expect(compiled.diagnostics).toEqual([]);
    expect(footprintOf(compiled)).toMatchObject({ files: [], complete: false });
  });

  it("follows the semantic service's effective recorder state over the environment", async () => {
    delete process.env[SEMANTIC_RECORDER_ENV];
    const compile = async (recording: { mode: 'off' | 'on' | 'verify'; unavailable?: string }) => {
      const local = services();
      local.semantic = Object.assign(Object.create(null), local.semantic, {
        recording: () => recording,
      });
      return new GeneratorContentCompiler(local).compile(
        { kind: 'api-tab', id: 'api', declaration },
        new AbortController().signal,
      );
    };
    expect(footprintOf(await compile({ mode: 'off' }))).toBeUndefined();
    expect(footprintOf(await compile({ mode: 'on', unavailable: 'probe failed' }))).toBeUndefined();
    expect(footprintOf(await compile({ mode: 'verify' }))).toMatchObject({
      files: ['/api-page.ts'],
      complete: true,
    });
    process.env[SEMANTIC_RECORDER_ENV] = '0';
    expect(footprintOf(await compile({ mode: 'on' }))).toMatchObject({ complete: true });
  });
});
