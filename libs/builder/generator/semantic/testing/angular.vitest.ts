import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { Node, Project } from 'ts-morph';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { getPlaygroundComponentInputs } from '../../../helpers/playground/get-playground-inputs';
import type { DiscoverySnapshot, JsonValue } from '../../contracts';
import { createDiscoveryServices } from '../../discovery';
import { literal, unwrap } from '../angular';
import { openRecordingScopes } from '../recorder';
import { createSemanticService } from '../semantic-service';
import { hostPath, join, resolve } from './engine-paths';
const repository = resolve(__dirname, '../../../../..');
let directory: string;
let service: ReturnType<typeof createSemanticService>;
const write = (name: string, text: string) => writeFileSync(join(directory, name), text);
const angular = `import { Component, Directive, Pipe, Input, input, model } from '@angular/core';
@Directive({selector: '[base]'}) export class Base { /** inherited docs */ @Input('baseAlias') inherited: string = ''; }
@Component({selector: 'demo-box, [demoBox]', templateUrl: './demo.html', styleUrls:['./demo.scss'], standalone: false})
export class Demo extends Base { /** Input docs */ @Input({alias: 'caption'}) title: 'small' | 'large' = 'small'; count = input(1, {alias: 'amount'}); required = model.required<string>({alias:'requiredAlias'}); }
@Pipe({name: 'pretty'}) export class Pretty {
/** Pipe transform.\n * @param value - Source\n * @param digits - Number of digits\n */ transform(value: string, digits: number): string { return value; } }
`;
function discovery(): DiscoverySnapshot {
  return {
    configuration: {
      projectId: 'angular',
      workspaceRoot: directory,
      docsRoots: [directory],
      tsConfig: join(directory, 'tsconfig.json'),
      outputRoot: join(directory, 'output'),
      cacheRoot: join(directory, 'cache'),
      routePrefix: '',
      guideDirectory: 'guide',
      apiDirectory: 'api',
      assetDirectory: 'assets',
      inlineStyleLanguage: 'SCSS',
      anchorHeadings: ['h2'],
      themes: { light: 'a', dark: 'b' },
      cacheEnabled: true,
      digest: 'config',
      executables: [],
    },
    entries: [
      {
        kind: 'guide',
        id: 'guide',
        source: { path: join(directory, 'entry.ts') },
        title: 'Guide',
        route: 'guide',
        absoluteRoute: 'guide',
        breadcrumbs: ['Guide'],
        runtimeImport: { source: join(directory, 'entry.ts'), exportName: 'default' },
        dependencies: [],
        markdown: [],
        hasImports: true,
      },
      {
        kind: 'api',
        id: 'api',
        source: { path: join(directory, 'entry.ts') },
        title: 'API',
        route: 'api',
        absoluteRoute: 'api',
        breadcrumbs: ['API'],
        runtimeImport: { source: join(directory, 'entry.ts'), exportName: 'default' },
        dependencies: [],
        scopes: [{ id: 'all', name: 'All', route: '', include: ['demo.ts'], exclude: [] }],
      },
    ],
    globalKeywords: [],
    remoteKeywords: [],
  };
}
async function sync() {
  const result = await service.synchronize(
    { generation: 1, discovery: discovery(), changes: [] },
    new AbortController().signal,
  );
  expect(result.diagnostics).toEqual([]);
}
beforeEach(() => {
  // The engine's spelling of the fixture root (forward slashes on Windows).
  directory = hostPath(mkdtempSync(join(tmpdir(), 'semantic-angular-')));
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        noLib: true,
        target: 'ES2022',
        ignoreDeprecations: '6.0',
        experimentalDecorators: true,
        strict: true,
        baseUrl: directory,
        paths: {
          '@angular/core': [join(repository, 'node_modules/@angular/core/types/core.d.ts')],
        },
      },
      include: ['*.ts'],
    }),
  );
  write('demo.ts', angular);
  write('demo.html', '<b>demo</b>');
  write('demo.scss', '.demo { color: red; }');
  write(
    'entry.ts',
    `import { Demo, Pretty } from './demo'; const Page = {demos:{Example: Demo},playgrounds:{component:{target: Demo, template:'<ng-doc-selector></ng-doc-selector>',controls:{extra:{type:'string',inputName:'extra',isManual:true}},content:{label:{template:'<b>Label</b>'}}},pipe:{target:Pretty,template:'{{ value | pretty }}'}}}; export default Page;`,
  );
  service = createSemanticService();
});
afterEach(async () => {
  await service.dispose();
  rmSync(directory, { recursive: true, force: true });
});

test('real Angular AST includes inherited/decorated/signal/model aliases and pipe parameters', async () => {
  await sync();
  const result = service.describeGuide('guide');
  expect(result.diagnostics).toEqual([]);
  const semantics = result.value!;
  expect(semantics.demos.Example.map((asset) => asset.language)).toEqual([
    'angular-ts',
    'angular-html',
    'SCSS',
  ]);
  // In the engine's spelling, as the content compiler records them (forward slashes on Windows).
  expect(semantics.demos.Example.map((asset) => asset.source)).toEqual(
    ['demo.ts', 'demo.html', 'demo.scss'].map((name) => join(directory, name)),
  );
  expect(result.dependencies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'content', path: join(directory, 'demo.html') }),
      expect.objectContaining({ kind: 'content', path: join(directory, 'demo.scss') }),
    ]),
  );
  expect(semantics.playgrounds[0]).toMatchObject({
    standalone: false,
    selector: 'demo-box,[demoBox]',
    target: { source: join(directory, 'demo.ts'), exportName: 'Demo' },
    properties: {
      title: { inputName: 'caption', options: ["'small'", "'large'"] },
      count: { inputName: 'amount', type: 'number' },
      required: { inputName: 'requiredAlias', type: 'string' },
      inherited: { inputName: 'baseAlias' },
      extra: { isManual: true },
    },
  });
  expect(semantics.playgrounds[0].templatesBySelector['demo-box']).toContain('[caption]');
  expect(semantics.playgrounds[1]).toMatchObject({
    pipeName: 'pretty',
    standalone: true,
    properties: { digits: { description: expect.stringContaining('Number of digits') } },
  });
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  const api = service.enumerateApi('api');
  expect(api.diagnostics).toEqual([]);
  expect(api.value!.map(({ name, apiListType }) => ({ name, apiListType }))).toEqual([
    { name: 'Base', apiListType: 'Directive' },
    { name: 'Demo', apiListType: 'Component' },
    { name: 'Pretty', apiListType: 'Pipe' },
  ]);
  expect(
    api.value!.find((item) => item.name === 'Demo')?.exportedKeywords.map((item) => item.key),
  ).toEqual(['Demo', 'demo-box', 'demoBox']);
  // Every descriptor carries the declaration's summary for search and the API list.
  expect(api.value?.find((item) => item.name === 'Base')).toMatchObject({
    signature: '@Directive({ … })\nexport class Base',
  });
  expect(api.value?.find((item) => item.name === 'Pretty')?.signature).toBe(
    '@Pipe({ … })\nexport class Pretty',
  );
  expect(api.value!.find((item) => item.name === 'Pretty')?.exportedKeywords).toContainEqual(
    expect.objectContaining({ key: 'pretty', languages: ['html'] }),
  );
});

test('optional and nullable inputs print the same types as the legacy engine, for every input kind', async () => {
  // The runtime gives `string | undefined`, `number | null` and `boolean | undefined` the control of
  // the primitive; both engines must print these types alike for every kind of input.
  write(
    'optional.ts',
    `import { Component, Input, booleanAttribute, input, model } from '@angular/core';
@Component({selector: 'optional-box', template: ''})
export class Optional {
  @Input() decorated?: string;
  @Input() nullable: number | null = null;
  signal = input<string>();
  signalNull = input<number | null>(null);
  twoWay = model<number>();
  transformed = input<boolean | undefined, unknown>(undefined, { transform: booleanAttribute });
}`,
  );
  write(
    'entry.ts',
    `import { Optional } from './optional'; export default {playgrounds:{optional:{target:Optional,template:'<ng-doc-selector></ng-doc-selector>'}}};`,
  );
  await sync();
  const result = service.describeGuide('guide');
  expect(result.diagnostics).toEqual([]);
  const generator = result.value?.playgrounds[0]?.properties as Record<
    string,
    { type: string; options: string[] }
  >;
  const project = new Project({ tsConfigFilePath: join(directory, 'tsconfig.json') });
  const legacy = getPlaygroundComponentInputs(
    project.getSourceFileOrThrow(join(directory, 'optional.ts')).getClassOrThrow('Optional'),
  );
  const types = (properties: Record<string, { type: string }>) =>
    Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, value.type]));
  expect(types(generator)).toEqual({
    decorated: 'string | undefined',
    nullable: 'number | null',
    signal: 'string | undefined',
    signalNull: 'number | null',
    twoWay: 'number | undefined',
    transformed: 'boolean | undefined',
  });
  expect(types(legacy)).toEqual(types(generator));
  // The options are the same members (the generator lists them in the written order).
  for (const [name, value] of Object.entries(legacy))
    expect([...generator[name].options].sort(), name).toEqual([...(value.options ?? [])].sort());
});

test('a query terminated by a template watchdog leaves a program that answers no query and is not retained', async () => {
  await service.dispose();
  let slow = false;
  service = createSemanticService({
    readGuideValues: () => {
      // A slow query, terminated by the `vm` watchdog of the template render that called it.
      const end = Date.now() + (slow ? 1_000 : 0);
      while (Date.now() < end) {
        // Synchronous work.
      }
      return { value: { playgrounds: {} }, dependencies: [], diagnostics: [] };
    },
  });
  const synchronize = async () => {
    const result = await service.synchronize(
      { generation: 1, discovery: discovery(), changes: [], retention: {} },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
  };
  await synchronize();
  expect(service.describeGuide('guide').diagnostics).toEqual([]);
  expect(service.retain()).toBeDefined();
  slow = true;
  const context = vm.createContext({ query: () => service.describeGuide('guide') });
  expect(() => new vm.Script('query()').runInContext(context, { timeout: 30 })).toThrow(
    'Script execution timed out',
  );
  // No `finally` ran: the query's recording scope is still open.
  expect(openRecordingScopes()).toBeGreaterThan(0);
  slow = false;
  expect(service.describeGuide('guide').diagnostics).toEqual([
    expect.objectContaining({ code: 'SEMANTIC_QUERY_INTERRUPTED', severity: 'error' }),
  ]);
  expect(openRecordingScopes()).toBe(0);
  expect(service.retain()).toBeUndefined();
  // The next synchronization builds the program again, and it answers queries.
  await synchronize();
  expect(service.describeGuide('guide').diagnostics).toEqual([]);
  expect(service.retain()).toBeDefined();

  // Terminated just before the program would be retained: it is not.
  slow = true;
  expect(() => new vm.Script('query()').runInContext(context, { timeout: 30 })).toThrow(
    'Script execution timed out',
  );
  expect(service.retain()).toBeUndefined();
  expect(openRecordingScopes()).toBe(0);
});

test('evaluated manual controls retain dependencies and assigned inputs are removed', async () => {
  write(
    'entry.ts',
    `import { Demo } from './demo'; const dynamic = () => ({}); export default {playgrounds:{x:{target:Demo,template:'<demo-box [caption]="fixed"></demo-box>',controls:dynamic()}}};`,
  );
  await service.dispose();
  service = createSemanticService({
    readGuideValues: () => ({
      value: {
        playgrounds: {
          x: {
            controls: {
              manual: {
                type: 'number',
                alias: 'manualAlias',
                description: 'Manual value',
                options: ['1', '2'],
              },
              plain: 'boolean',
            },
          },
        },
      },
      dependencies: [{ kind: 'content', path: join(directory, 'manual.json'), digest: 'value' }],
      diagnostics: [],
    }),
  });
  await sync();
  const result = service.describeGuide('guide');
  expect(result.diagnostics).toEqual([]);
  expect(result.value?.playgrounds[0].properties.title).toBeUndefined();
  expect(result.value?.playgrounds[0].properties).toMatchObject({
    manual: {
      inputName: 'manualAlias',
      type: 'number',
      description: 'Manual value',
      options: ['1', '2'],
      isManual: true,
    },
    plain: { inputName: 'plain', type: 'boolean', isManual: true },
  });
  expect(result.dependencies).toContainEqual({
    kind: 'content',
    path: join(directory, 'manual.json'),
    digest: 'value',
  });
});

test('composes the real discovery values reader without a pre-normalized controls DTO', async () => {
  const docs = join(directory, '.docs');
  mkdirSync(docs);
  writeFileSync(join(docs, 'index.md'), '# Guide');
  writeFileSync(
    join(docs, 'ng-doc.page.ts'),
    `import { Demo } from '../demo';
const controlType = 'number';
const Page = {
  title: 'Guide',
  mdFile: './index.md',
  playgrounds: {
    x: {
      target: Demo,
      template: '<demo-box></demo-box>',
      controls: {
        plain: 'boolean',
        renamed: { type: controlType, alias: 'amount', description: 'Computed', options: ['1', '2'] },
      },
    },
  },
};
export default Page;`,
  );
  const discoveryServices = createDiscoveryServices();
  try {
    const discovered = await discoveryServices.discovery.discover(
      {
        generation: 1,
        projectId: 'angular',
        workspaceRoot: directory,
        defaults: {
          docsRoot: docs,
          tsConfig: join(directory, 'tsconfig.json'),
          outputRoot: join(directory, 'output'),
          cacheRoot: join(directory, 'cache'),
        },
        changes: [],
      },
      new AbortController().signal,
    );
    expect(discovered.diagnostics).toEqual([]);
    const guide = discovered.value!.entries.find((entry) => entry.kind === 'guide')!;
    const raw = discoveryServices.values.readGuideValues(guide.id);
    expect(raw.value).toEqual({
      playgrounds: {
        x: {
          controls: {
            plain: 'boolean',
            renamed: {
              type: 'number',
              alias: 'amount',
              description: 'Computed',
              options: ['1', '2'],
            },
          },
        },
      },
    });
    await service.dispose();
    service = createSemanticService({
      readGuideValues: (entryId) => discoveryServices.values.readGuideValues(entryId),
    });
    expect(
      (
        await service.synchronize(
          { generation: 1, discovery: discovered.value!, changes: [] },
          new AbortController().signal,
        )
      ).diagnostics,
    ).toEqual([]);
    const result = service.describeGuide(guide.id);
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.playgrounds[0].properties).toMatchObject({
      plain: { inputName: 'plain', type: 'boolean', isManual: true },
      renamed: {
        inputName: 'amount',
        type: 'number',
        description: 'Computed',
        options: ['1', '2'],
        isManual: true,
      },
    });
    expect(result.value?.playgrounds[0].properties.renamed).not.toHaveProperty('alias');
    expect(result.value?.playgrounds[0].templatesBySelector['demo-box']).toContain(
      '[amount]="properties()[\'renamed\']"',
    );
  } finally {
    await discoveryServices.runtime.dispose();
  }
});

test('external snippets retain icon/opened and missing snippet/style reads are observed', async () => {
  write('demo.html', '<!-- snippet-from-file="./snippet.html" "External" icon="star" opened -->');
  write('snippet.html', '<span>External snippet</span>');
  await sync();
  let result = service.describeGuide('guide');
  expect(result.diagnostics).toEqual([]);
  expect(result.value!.demos.Example).toContainEqual(
    expect.objectContaining({
      title: 'External',
      icon: 'star',
      opened: true,
      code: expect.stringContaining('External snippet'),
    }),
  );
  rmSync(join(directory, 'snippet.html'));
  result = service.describeGuide('guide');
  expect(result.value).toBeUndefined();
  expect(result.dependencies).toContainEqual({
    kind: 'existence',
    path: join(directory, 'snippet.html'),
    exists: false,
  });
});

test.each([
  ['export default function page() {}', 'SEMANTIC_ENTRY_OBJECT'],
  ['export default {demos: []}', 'SEMANTIC_DEMO_OBJECT'],
  ['export default {demos: {missing: Unknown}}', 'SEMANTIC_DEMO_TARGET'],
  ['export default {demos: {...other}}', 'SEMANTIC_DEMO_TARGET'],
  ['export default {playgrounds: []}', 'SEMANTIC_PLAYGROUNDS_OBJECT'],
  ['export default {playgrounds: {...other}}', 'SEMANTIC_PLAYGROUND_OBJECT'],
  ['export default {playgrounds: {x: 1}}', 'SEMANTIC_PLAYGROUND_OBJECT'],
  ['export default {playgrounds: {x: {target: Missing}}}', 'SEMANTIC_PLAYGROUND_TARGET'],
  [
    'class Plain {} export default {playgrounds: {x: {target: Plain}}}',
    'SEMANTIC_PLAYGROUND_TARGET',
  ],
  [
    "import {Demo} from './demo';export default {playgrounds:{x:{target:Demo,controls:make()}}}",
    'SEMANTIC_DYNAMIC_CONTROLS',
  ],
  [
    "import {Demo} from './demo';export default {playgrounds:{x:{target:Demo,controls:[]}}}",
    'SEMANTIC_CONTROLS_SHAPE',
  ],
  [
    "import {Demo} from './demo';export default {playgrounds:{x:{target:Demo,template:'<demo-box></demo-box>',controls:{bad:null}}}}",
    'SEMANTIC_CONTROLS_SHAPE',
  ],
])('invalid guide %s returns structured diagnostic', async (text, code) => {
  write('entry.ts', text);
  await sync();
  expect(service.describeGuide('guide').diagnostics[0].code).toBe(code);
});

test('empty guide and evaluated control failures', async () => {
  write('entry.ts', 'export default {} satisfies object;');
  await sync();
  expect(service.describeGuide('guide').value).toEqual({ demos: {}, playgrounds: [] });
  await service.dispose();
  service = createSemanticService({
    readGuideValues: () => ({
      dependencies: [],
      diagnostics: [
        { code: 'EVALUATION', severity: 'error', stage: 'evaluation', message: 'control failed' },
      ],
    }),
  });
  await sync();
  expect(service.describeGuide('guide').diagnostics[0]).toMatchObject({
    code: 'SEMANTIC_GUIDE_VALUES',
    message: 'control failed',
  });
});

test('literal control parser handles JSON wrappers without execution and rejects unsupported values/cycles', () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    'literal.ts',
    `const data = ({text:'hello',template:\`hi\`,number:2,negative:-1,truth:true,falsehood:false,empty:null,array:[1,'x']} as const); const cycle=cycle; const bad={...data};`,
  );
  expect(literal(source.getVariableDeclarationOrThrow('data'))).toEqual({
    text: 'hello',
    template: 'hi',
    number: 2,
    negative: -1,
    truth: true,
    falsehood: false,
    empty: null,
    array: [1, 'x'],
  });
  expect(unwrap(source.getVariableDeclarationOrThrow('cycle'))).toBeUndefined();
  expect(unwrap(undefined)).toBeUndefined();
  expect(() => literal(source.getVariableDeclarationOrThrow('bad'))).toThrow('Computed controls');
});

test('snippet formatting follows workspace configuration edits', async () => {
  write('demo.ts', angular + '\n// snippet:ts "Quoted"\nconst text = "hello";\n// snippet\n');
  write('.prettierrc', '{"singleQuote":true}');
  await sync();
  const first = service.describeGuide('guide');
  expect(first.diagnostics).toEqual([]);
  expect(first.value!.demos.Example.find((asset) => asset.title === 'Quoted')?.code).toContain(
    "'hello'",
  );
  write('.prettierrc', '{"singleQuote":false}');
  await sync();
  const second = service.describeGuide('guide');
  expect(second.diagnostics).toEqual([]);
  expect(second.value!.demos.Example.find((asset) => asset.title === 'Quoted')?.code).toContain(
    '"hello"',
  );
});
