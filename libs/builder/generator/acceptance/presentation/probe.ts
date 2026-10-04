import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFragment } from 'parse5';
import ts from 'typescript';

import { createOutputCommitter } from '../../artifacts';
import type { ArtifactSnapshot, JsonValue } from '../../contracts';
import { createWorkerCompilationService } from '../../worker';

const [root, runtime, repository, evidence] = process.argv.slice(2);
const checks: Array<{ name: string; passed: boolean; detail?: unknown }> = [];
const check = (name: string, passed: boolean, detail?: unknown) =>
  checks.push({ name, passed, ...(detail === undefined ? {} : { detail }) });
const specialTitle = "Apostrophe's `backtick` ${literal} ☃";
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const write = async (file: string, text: string) => {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
  return target;
};
function text(html: string): string {
  function walk(node: any): string {
    return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(walk).join(' ');
  }
  return walk(parseFragment(html)).replace(/\s+/g, ' ').trim();
}
function byId(html: string, id: string): any {
  function walk(node: any): any {
    if (node.attrs?.some((a: any) => a.name === 'id' && a.value === id)) return node;
    for (const child of node.childNodes ?? []) {
      const found = walk(child);
      if (found) return found;
    }
  }
  return walk(parseFragment(html));
}
function nodeText(node: any): string {
  return node?.nodeName === '#text'
    ? node.value
    : (node?.childNodes ?? []).map(nodeText).join(' ').replace(/\s+/g, ' ').trim();
}
function propertyStrings(source: ts.SourceFile, name: string): string[] {
  const result: string[] = [];
  function walk(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === name &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    )
      result.push(node.initializer.text);
    ts.forEachChild(node, walk);
  }
  walk(source);
  return result;
}
const timeout = setTimeout(() => {
  console.error('presentation observation deadline');
  process.exit(3);
}, 60_000);
const outputRoot = path.join(root, 'out');
let service: ReturnType<typeof createWorkerCompilationService> | undefined;
let committer: ReturnType<typeof createOutputCommitter> | undefined;
try {
  await write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
  );
  await write(
    'ng-doc.config.ts',
    `export default {docsPath:'docs',cache:true,repoConfig:{url:'https://gitlab.example/docs',platform:'gitlab',mainBranch:'main',releaseBranch:'release'}};`,
  );
  await write(
    'docs/ng-doc.api.ts',
    `const api={title:'API',scopes:[{name:'Public',route:'public',include:['docs/api.ts']}]};export default api;`,
  );
  const apiSource = [
    '/** Rich summary @status:experimental',
    ' *',
    ' * ```typescript',
    ' * @fencedOnly literalDecorator',
    ' * const email = "hello@example.test";',
    ' * ```',
    ' *',
    ' * @remarks First rich remark.',
    ' * @remarks Second rich remark.',
    ' * @param value - First parameter line.',
    ' * Continued parameter line.',
    ' * @returns Rendered return explanation.',
    ' * @example First example marker.',
    ' * @example Second example marker.',
    ' */',
    'export function rich(value: string): string { return value; }',
    '/** Base callable summary. */',
    'export interface CallableBase {',
    ' /** Inherited call documentation. */ (value: string): number;',
    ' /** Inherited property documentation. */ inheritedField: string;',
    '}',
    '/** Child callable summary. */ export interface Callable extends CallableBase { ownField: boolean }',
    '/** Base object alias. */ export type ObjectAlias = { aliasField: string; größe: number };',
    '/** Intersected object alias. */ export type IntersectionAlias = ObjectAlias & { extraField: boolean };',
    '/** Reference alias. */ export type ReferenceAlias = IntersectionAlias;',
    '/** Union is presentation-only. */ export type UnionAlias = ObjectAlias | { alternative: number };',
  ].join('\n');
  await write('docs/api.ts', apiSource);
  await write(
    'docs/guide/ng-doc.page.ts',
    `const page={title:${JSON.stringify(specialTitle)},route:'guide',mdFile:'./index.md.nunj'};export default page;`,
  );
  await write(
    'docs/guide/snippet.ts',
    [
      'const beforeMarker = 0;',
      '// ng-doc-ignore-line 12',
      ...Array.from({ length: 12 }, (_, i) => `const forbidden${i + 1} = ${i + 1};`),
      'const afterMarker = 13;',
    ].join('\n'),
  );
  await write(
    'docs/guide/index.md.nunj',
    [
      '---',
      `title: ${JSON.stringify(specialTitle)}`,
      'keyword: SpecialGuide',
      '---',
      '# Unicode Привет ☃',
      '',
      '```typescript file="snippet.ts" group="examples" name="Named client" icon="code" active',
      'ignored',
      '```',
      '',
      '<div id="embedded-rich">',
      '{{ NgDocApi.api("docs/api.ts#rich") }}',
      '</div>',
      '',
      '<div id="embedded-callable">',
      '{{ NgDocApi.api("docs/api.ts#Callable") }}',
      '</div>',
      '',
      '<div id="summary-rich">',
      '{{ JSDoc.description("docs/api.ts#rich") }}',
      '</div>',
      '',
      '<p id="fenced-tag">{{ JSDoc.hasTag("docs/api.ts#rich", "fencedOnly") }}</p>',
      '<p id="remark-count">{{ JSDoc.tags("docs/api.ts#rich", "remarks") | length }}</p>',
      '<p id="example-count">{{ JSDoc.tags("docs/api.ts#rich", "example") | length }}</p>',
      '<a id="anchor-link" href="#unicode-привет-">Anchor</a>',
      '<a id="query-link" href="?mode=check#unicode-привет-">Query</a>',
      '<a id="mail-link" href="mailto:docs@example.test">Mail</a>',
      '<a id="origin-link" href="https://docs.example.test/preview/guide">Same origin candidate</a>',
    ].join('\n'),
  );
  service = createWorkerCompilationService({
    moduleUrl: pathToFileURL(path.join(runtime, 'compiler.mjs')),
    workerEntryUrl: pathToFileURL(path.join(runtime, 'worker/entry.js')),
    compileTimeoutMs: 30_000,
    factoryOptions: {
      projectId: 'presentation',
      workspaceRoot: root,
      configFile: path.join(root, 'ng-doc.config.ts'),
      defaults: {
        docsRoot: path.join(root, 'docs'),
        tsConfig: path.join(root, 'tsconfig.json'),
        outputRoot,
        cacheRoot: path.join(root, 'cache'),
      },
      templateRoot: path.join(repository, 'libs/builder/templates'),
      compilerVersion: 't12-presentation',
      toolchainDigest: 'real-ts6-node24',
    } as JsonValue,
  });
  const compiled = await service.compile(
    { generation: 1, mode: 'production', changes: [] },
    new AbortController().signal,
  );
  if (!compiled.candidate || compiled.diagnostics.some((d) => d.severity === 'error'))
    throw new Error(JSON.stringify(compiled.diagnostics));
  const snapshot: ArtifactSnapshot = compiled.candidate;
  const guide = snapshot.artifacts
    .flatMap((a) => a.content)
    .find((c) => c.ir.role === 'guide-tab')!;
  const apiHtml = (name: string) =>
    snapshot.artifacts
      .find((a) => a.routes.some((r) => r.title === name))
      ?.content.map((c) => c.html)
      .join('\n') ?? '';
  const rich = apiHtml('rich'),
    callable = apiHtml('Callable');
  const guideText = text(guide.html),
    richText = text(rich),
    callableText = text(callable);
  const embeddedRich = nodeText(byId(guide.html, 'embedded-rich'));
  const embeddedCallable = nodeText(byId(guide.html, 'embedded-callable'));
  const summary = nodeText(byId(guide.html, 'summary-rich'));
  const snippetText = nodeText(byId(guide.html, 'does-not-exist')) || guideText;
  check(
    'ignore-line12-exact',
    snippetText.includes('beforeMarker') &&
      snippetText.includes('afterMarker') &&
      Array.from({ length: 12 }, (_, i) => `forbidden${i + 1}`).every(
        (s) => !snippetText.includes(s),
      ),
    { guideText },
  );
  check(
    'fenced-at-retained-in-summary',
    summary.includes('@fencedOnly') &&
      summary.includes('literalDecorator') &&
      summary.includes('hello@example.test'),
    { summary },
  );
  check('fenced-at-is-not-tag', nodeText(byId(guide.html, 'fenced-tag')) === 'false', {
    actual: nodeText(byId(guide.html, 'fenced-tag')),
  });
  check(
    'status-omitted-from-summary',
    !summary.includes('@status') && !summary.includes('experimental'),
    { summary },
  );
  check(
    'multiple-remarks-examples',
    nodeText(byId(guide.html, 'remark-count')) === '2' &&
      nodeText(byId(guide.html, 'example-count')) === '2' &&
      [
        'First rich remark',
        'Second rich remark',
        'First example marker',
        'Second example marker',
      ].every((s) => richText.includes(s)),
    { richText },
  );
  const sharedTokens = [
    'Presentation',
    'Returns',
    'Parameters',
    'First parameter line.',
    'Continued parameter line.',
    'Rendered return explanation.',
  ];
  check(
    'full-page-embedded-signature-params-returns',
    sharedTokens.every((s) => richText.includes(s) && embeddedRich.includes(s)),
    { richText, embeddedRich },
  );
  check(
    'embedded-intentional-prose-suppression',
    ['Rich summary', 'First rich remark', 'First example marker'].every(
      (s) => richText.includes(s) && !embeddedRich.includes(s),
    ),
    { embeddedRich },
  );
  check(
    'callable-inherited-call-and-property',
    [
      'Inherited call documentation.',
      'Inherited property documentation.',
      'inheritedField',
      'ownField',
      'Call Signatures',
      'CallableBase',
    ].every((s) => callableText.includes(s) && embeddedCallable.includes(s)),
    { callableText, embeddedCallable },
  );
  check(
    'object-intersection-reference-alias-properties',
    ['ObjectAlias', 'IntersectionAlias', 'ReferenceAlias'].every((name) => {
      const content = text(apiHtml(name));
      return (
        content.includes('aliasField') &&
        content.includes('größe') &&
        (name === 'ObjectAlias' || content.includes('extraField'))
      );
    }),
    {
      aliasText: ['ObjectAlias', 'IntersectionAlias', 'ReferenceAlias'].map((name) => ({
        name,
        text: text(apiHtml(name)),
      })),
    },
  );
  check(
    'union-alias-presentation-only',
    text(apiHtml('UnionAlias')).includes('UnionAlias') &&
      !text(apiHtml('UnionAlias')).includes('Properties'),
    { text: text(apiHtml('UnionAlias')) },
  );
  check(
    'unicode-anchor-and-keyword',
    guide.ir.anchors.some((a) => a.anchor.includes('unicode-привет')) &&
      snapshot.artifacts
        .flatMap((a) => a.exportedKeywords)
        .some((k) => k.path.includes('#unicode-привет')),
    { anchors: guide.ir.anchors },
  );
  check(
    'code-tab-name-icon',
    guide.html.includes('Named client') &&
      guide.html.includes('icon="code"') &&
      guide.html.includes('group="examples"'),
  );
  check(
    'special-title-IR-search-roundtrip',
    guide.ir.title === specialTitle &&
      JSON.parse(JSON.stringify(guide)).ir.title === specialTitle &&
      guide.searchRecords.some((r) => r.title === specialTitle),
    { title: guide.ir.title, search: guide.searchRecords },
  );
  const generated = snapshot.artifacts
    .flatMap((a) => a.outputs)
    .filter((o) => o.path.endsWith('.ts'));
  const parsed = generated.map((o) => ({
    output: o,
    source: ts.createSourceFile(o.path, o.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS),
  }));
  const syntax = parsed.flatMap(({ output, source }) =>
    (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.map(
      (d) => ({ path: output.path, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }),
    ),
  );
  check(
    'special-title-generated-TS-roundtrip',
    syntax.length === 0 &&
      parsed.some(({ source }) => propertyStrings(source, 'title').includes(specialTitle)),
    { syntax, titles: parsed.flatMap(({ source }) => propertyStrings(source, 'title')) },
  );
  check(
    'GitLab-branch-line-links',
    generated.some((o) => o.content.includes('/-/edit/main/docs/api.ts')) &&
      generated.some((o) => o.content.includes('/-/blob/release/docs/api.ts#L')),
  );
  check(
    'pure-link-targets-preserved',
    [
      ['anchor-link', '#unicode-привет-'],
      ['query-link', '?mode=check#unicode-привет-'],
      ['mail-link', 'mailto:docs@example.test'],
      ['origin-link', 'https://docs.example.test/preview/guide'],
    ].every(
      ([id, href]) =>
        byId(guide.html, id)?.attrs.find((a: any) => a.name === 'href')?.value === href,
    ),
  );
  committer = createOutputCommitter({ outputRoot });
  const committed = await committer.commit(
    { generation: 1, candidate: snapshot },
    { isCurrent: () => true },
    new AbortController().signal,
  );
  check(
    'real-commit-complete-product',
    committed.status === 'committed' &&
      committed.manifest.files.length === snapshot.artifacts.flatMap((a) => a.outputs).length,
  );
  if (committed.status === 'committed')
    for (const output of snapshot.artifacts.flatMap((a) => a.outputs)) {
      const actual = await readFile(path.join(outputRoot, output.path));
      if (hash(actual.toString()) !== output.digest)
        throw new Error(`physical digest mismatch ${output.path}`);
    }
  const warm = await service.compile(
    { generation: 2, mode: 'production', changes: [] },
    new AbortController().signal,
  );
  check(
    'fresh-worker-warm-exact-candidate',
    JSON.stringify(warm.candidate) === JSON.stringify(snapshot) && warm.whyRebuilt.length === 0,
  );
  await writeFile(path.join(evidence, 'guide.html'), guide.html);
  await writeFile(path.join(evidence, 'rich.html'), rich);
  await writeFile(path.join(evidence, 'callable.html'), callable);
  const summaryReport = {
    status: checks.every((c) => c.passed) ? 'passed' : 'assertion-failed',
    node: process.version,
    checks,
    boundary:
      'Real disposable process compiler/discovery/TS6/semantic/Nunjucks/Markdown/linking/cache plus real filesystem commit. parse5 observes HTML and native TypeScript parses emitted modules; no Angular browser/SSR claim.',
    artifactCount: snapshot.artifacts.length,
    outputCount: snapshot.artifacts.flatMap((a) => a.outputs).length,
    diagnostics: compiled.diagnostics,
    snapshotRevision: snapshot.revision,
    sourceFixture: apiSource,
    generatedTitle: specialTitle,
  };
  await writeFile(
    path.join(evidence, 'summary.json'),
    JSON.stringify(summaryReport, null, 2) + '\n',
  );
  process.exitCode = summaryReport.status === 'passed' ? 0 : 1;
} catch (error) {
  await writeFile(
    path.join(evidence, 'summary.json'),
    JSON.stringify(
      {
        status: 'runtime-or-setup-error',
        error: String(error),
        stack: (error as Error).stack,
        checks,
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 2;
} finally {
  await committer?.dispose();
  await service?.dispose();
  clearTimeout(timeout);
}
process.exit(process.exitCode ?? 0);
