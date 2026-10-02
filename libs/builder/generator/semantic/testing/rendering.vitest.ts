import { kebabCase } from '@ng-doc/core';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { Node, Project } from 'ts-morph';
import ts from 'typescript';
import { describe, expect, test, vi } from 'vitest';

import { apiDeclaration } from '../api-summary';
import { diagnostic, SemanticFailure, TrackedFiles } from '../dependencies';
import { withIndexedDerivedClasses } from '../derived-classes';
import type { SupportedDeclaration } from '../program-state';
import { createJsDoc, renderApiTemplate, renderMarkdown } from '../rendering';
import { join, resolve } from './engine-paths';

test('runtime AST import closure cannot load Builder/engine barrels, Architect or globals', () => {
  const workspace = resolve(__dirname, '../../../../..');
  const seen = new Set<string>();
  const forbidden: string[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const emitted = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
      },
    }).outputText;
    const ast = ts.createSourceFile(file, emitted, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const specifier = node.arguments[0].text;
        if (
          specifier === '@ng-doc/builder' ||
          /architect|\/engine(?:\/|$)|GLOBALS|\/global(?:s)?(?:\/|$)/i.test(specifier)
        )
          forbidden.push(`${file} -> ${specifier}`);
        let path = specifier.startsWith('.')
          ? resolve(dirname(file), specifier)
          : specifier.startsWith('@ng-doc/core')
            ? resolve(
                workspace,
                'libs/core',
                specifier.slice('@ng-doc/core'.length).replace(/^\//, ''),
              )
            : undefined;
        if (path) {
          path = [`${path}.ts`, join(path, 'index.ts')].find(existsSync);
          if (path) visit(path);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(ast);
  };
  visit(resolve(__dirname, '../semantic-service.ts'));
  expect(forbidden).toEqual([]);
  expect(seen.size).toBeGreaterThan(50);
});

test('standalone Markdown preserves alert, code group metadata, external lines and HTML', () => {
  const read = vi.fn(() => 'first\nsecond\nthird');
  const html = renderMarkdown(
    '> **Warning** Careful\n\n> Ordinary\n\n```typescript file="sample.ts"\nignored\n```\n\n```html group="examples" name="One" icon="star" active\n<b>code</b>\n```\n\n<div>inline</div>\n\n<span>word</span>',
    { source: '/docs/entry.ts', read },
  );
  expect(html).toContain('ng-doc-blockquote type="warning"');
  expect(html).toContain('<ng-doc-blockquote>');
  expect(html).toContain('first');
  expect(html).toContain('ng-doc-tab');
  expect(html).toContain('star');
  expect(html).toContain('&lt;b&gt;');
  expect(read).toHaveBeenCalledWith(resolve('/docs/sample.ts'));
  expect(renderMarkdown('```\ncode\n```', { source: 'entry', read })).toContain(
    'language-typescript',
  );
});

test('TSDoc status filtering and absent/empty tags remain deterministic', () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    'doc.ts',
    '/** Summary @status:experimental\n * @remarks\n * @param name - First line\n * next line\n */\nexport function value(name: string) {}',
  );
  const docs = createJsDoc((text) => text);
  const node = source.getFunctionOrThrow('value');
  expect(docs.getJsDocDescription(node)).not.toContain('@status');
  expect(docs.getJsDocParam(node, 'name')).toContain('next line');
  expect(docs.getJsDocParam(node, 'missing')).toBe('');
  expect(docs.getJsDocDescription()).toBe('');
  expect(docs.getJsDocTag(node, 'remarks')).toBe('');
  expect(docs.getJsDocTags(node, 'remarks')).toEqual(['']);
  expect(docs.getAllJsDocTags()).toEqual({});
});

test('template filter registry excludes internal members and records every template read', () => {
  const directory = mkdtempSync(join(tmpdir(), 'semantic-templates-'));
  try {
    writeFileSync(
      join(directory, 'main.nunj'),
      '{{ nodes | excludeByJsDocTags("internal") | length }}',
    );
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      'members.ts',
      '/** @internal */\nexport interface Hidden {}\nexport interface Visible {}',
    );
    const files = new TrackedFiles();
    expect(
      renderApiTemplate(
        'main.nunj',
        { nodes: source.getInterfaces() },
        directory,
        files,
        (text) => text,
      ),
    ).toBe('1');
    expect(files.all()).toHaveLength(2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('member badges print the whole modifier and the kind chip names a type alias in words', () => {
  const templates = resolve(__dirname, '../../../templates');
  const directory = mkdtempSync(join(tmpdir(), 'semantic-badges-'));
  try {
    for (const name of [
      'helpers/badge.html.nunj',
      'helpers/tag.html.nunj',
      'helpers/modifier.html.nunj',
      'helpers/declaration-modifiers.html.nunj',
      'parts/page-tags.html.nunj',
    ]) {
      mkdirSync(dirname(join(directory, name)), { recursive: true });
      writeFileSync(join(directory, name), readFileSync(join(templates, name), 'utf8'));
    }
    writeFileSync(
      join(directory, 'main.nunj'),
      '{% import "helpers/declaration-modifiers.html.nunj" as tags %}{{ tags.render(member, "badge") }}',
    );
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      'members.ts',
      'export abstract class Base { protected static readonly size = 1; }\nexport type Alias = string;',
    );
    const render = (template: string, context: object) =>
      renderApiTemplate(template, context, directory, new TrackedFiles(), (text) => text);
    const member = source.getClassOrThrow('Base').getPropertyOrThrow('size');
    const badges = [...render('main.nunj', { member }).matchAll(/ng-doc-badge"[^>]*>([^<]*)</g)];
    expect(badges.map((badge) => badge[1])).toEqual(['protected', 'static', 'readonly']);
    const tags = render('parts/page-tags.html.nunj', {
      declaration: source.getTypeAliasOrThrow('Alias'),
      scope: { name: '@scope/lib' },
    });
    expect(tags).toMatch(/data-content="TypeAlias">Type alias</);
    expect(
      render('parts/page-tags.html.nunj', {
        declaration: source.getClassOrThrow('Base'),
        scope: { name: '@scope/lib' },
      }),
    ).toMatch(/data-content="Class">Class</);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('dependency replacement, diagnostic provenance and arbitrary thrown values', () => {
  const files = new TrackedFiles([
    { kind: 'semantic', scopeId: 'one', files: [], digest: 'a', reason: 'a' },
  ]);
  files.add({ kind: 'semantic', scopeId: 'one', files: [], digest: 'b', reason: 'b' });
  expect(files.all()).toHaveLength(1);
  expect(
    diagnostic(new SemanticFailure('OWN', 'message', { path: '/own' }), { path: '/fallback' }),
  ).toMatchObject({ code: 'OWN', source: { path: '/own' } });
  expect(diagnostic('literal', { path: '/fallback' })).toMatchObject({
    message: 'literal',
    source: { path: '/fallback' },
  });
});

test('the symbol view renders one filterable members table with the per-section anchors', () => {
  const templates = resolve(__dirname, '../../../templates');
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    'widget.ts',
    `
    function Input(): any { return () => undefined; }
    function Component(options: object): any { return () => undefined; }
    function input<T>(value?: T): T { return value as T; }
    input.required = <T>(): T => undefined as T;
    function output<T>(): T { return undefined as T; }
    export class Base {
      /** Inherited value. */
      inherited = 1;
    }
    /** A widget. */
    @Component({ selector: 'app-widget' })
    export class Widget<T> extends Base {
      /** Shared default. */
      static readonly DEFAULT = 'default';
      /** Decorated input. */
      @Input() size: number = 1;
      /** Signal input. */
      readonly label = input('Label');
      readonly id = input.required<string>();
      readonly changed = output<string>();
      protected hidden = true;
      /** Creates a widget. */
      constructor(readonly name: string) { super(); }
      /** The current value. */
      get value(): T | undefined { return undefined; }
      set value(value: T | undefined) {}
      /**
       * Opens it.
       * @param when - The delay.
       * @returns Whether it opened.
       */
      open(when: number): boolean { return when > 0; }
      close(): void {}
    }
    export interface Callable {
      /** A property. */
      size?: number;
      (value: string): number;
    }
    `,
  );
  // The semantic service renders API templates with its derived-class index, as here.
  const render = (template: string, declaration: SupportedDeclaration) =>
    withIndexedDerivedClasses(declaration, project, () =>
      renderApiTemplate(
        template,
        { declaration, docNode: declaration, templateName: '', scope: { name: '@scope/lib' } },
        templates,
        new TrackedFiles(),
        (text) => (text ? `<p>${text}</p>` : ''),
      ),
    );
  const widget = source.getClassOrThrow('Widget');
  const page = render('symbol/page.html.nunj', widget);
  const header = render('symbol/header.html.nunj', widget);

  expect(header).toMatch(/data-content="Class">Class</);
  expect(header).toContain('<h1');
  expect(header).not.toContain('ng-doc-api-table');
  expect(page).toContain('<ng-doc-members>');
  expect(page).toContain('metastring=\'{"name":"Declaration"}\'');
  expect(page).toContain('@Component({ … })\nexport class Widget&lt;T&gt; extends Base { … }');
  // A header too long for one line puts every heritage clause on its own line.
  expect(
    apiDeclaration(
      project
        .createSourceFile(
          'long.ts',
          'interface Many<T> {}\nexport abstract class AVeryLongDeclarationName extends Array<string> implements Many<number>, Many<string> {}',
        )
        .getClassOrThrow('AVeryLongDeclarationName'),
    ),
  ).toBe(
    'export abstract class AVeryLongDeclarationName\n  extends Array<string>\n  implements Many<number>, Many<string> { … }',
  );
  // The selectors stay indexed, as in the per-section layout.
  expect(page).toMatch(
    /<dl class="ng-doc-api-details">[\s\S]*<dt indexable="false">Selectors<\/dt>\s*<dd><code>app-widget<\/code><\/dd>/,
  );
  const tabs = [
    ...page.matchAll(
      /data-ng-doc-members-tab="([^"]+)"[^>]*>([^<]+)<span class="ng-doc-members-count">(\d+)/g,
    ),
  ];
  expect(tabs.map((tab) => [tab[1], tab[2].trim(), tab[3]])).toEqual([
    ['all', 'All', '12'],
    ['constructor', 'Constructor', '1'],
    ['static-properties', 'Static Properties', '1'],
    ['properties', 'Properties', '6'],
    ['accessors', 'Accessors', '2'],
    ['methods', 'Methods', '2'],
    ['inherited', 'Inherited', '1'],
  ]);
  // Group rows are the headings of the per-section layout; member rows keep its anchors.
  expect(page).toMatch(
    /data-group="properties">\s*<td colspan="2"><h3 class="ng-doc-members-group-title">Properties<\/h3>/,
  );
  expect(page).toMatch(/data-name="size" dataSlug="size" dataSlugType="member"/);
  expect(page).toMatch(
    /data-name="inherited" data-inherited dataSlug="inherited" dataSlugType="member"/,
  );
  expect(page).toMatch(/dataSlug="get-value" dataSlugType="member" dataSlugTitle="value"/);
  expect(page).toMatch(/data-name="open" dataSlug="open\(\)" dataSlugType="method"/);
  expect(page).toMatch(
    /aria-controls="ng-doc-member-detail-methods-open"[^>]*>.*<span class="ng-doc-member-name">open<\/span><\/button>/s,
  );
  expect(page).toMatch(
    /<tr class="ng-doc-member-detail" id="ng-doc-member-detail-methods-open" data-group="methods" hidden>/,
  );
  // Constructor parameters keep their member anchors.
  expect(page).toMatch(/dataSlug="name" dataSlugType="member"/);
  // Decorator and signal inputs and outputs carry a chip; required inputs a tag.
  // Decorator chips name their decorator, the hook of their hue; signal members count as inputs
  // and outputs.
  expect(page).toContain('<code data-ng-doc-decorator="Input">@Input</code>');
  expect(page).toContain('<code data-ng-doc-decorator="Component">@Component</code>');
  expect(page).toContain(
    '<code data-ng-doc-decorator="Input" data-ng-doc-signal="input">input()</code>',
  );
  expect(page).toContain(
    '<code data-ng-doc-decorator="Output" data-ng-doc-signal="output">output()</code>',
  );
  // The rail copy of the details, hidden until the page moves it.
  expect(page).toMatch(
    /<dl class="ng-doc-api-details" data-ng-doc-variant="rail" data-ng-doc-rail-details hidden indexable="false">\s*<dt indexable="false">Kind<\/dt>/,
  );
  expect(page).toMatch(/<dt indexable="false">Scope<\/dt>\s*<dd>@scope\/lib<\/dd>/);
  expect(page).toMatch(
    /data-ng-doc-signal="input">input\(\)<\/code><\/span>\s*<span class="ng-doc-badge"[^>]*data-content="required">required<\/span>/,
  );
  expect(page).toContain('Whether it opened.');
  expect(page).toContain('inherited from <code>Base</code>');

  const callable = render('symbol/page.html.nunj', source.getInterfaceOrThrow('Callable'));
  expect(callable).toMatch(/dataSlug="Call Signature #1" dataSlugType="method"/);
  expect(callable).toContain('data-ng-doc-members-tab="call-signatures"');
  expect(callable).toContain('export interface Callable { … }');
});

describe('symbol view anchors', () => {
  const templates = resolve(__dirname, '../../../templates');
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    'api.ts',
    `
    function Component(options: object): any { return () => undefined; }
    function Injectable(): any { return () => undefined; }
    /** A base. */
    export class Base {
      /** Shared. */
      shared = 1;
      /** Base method. */
      run(): void {}
    }
    /** Derived with nothing else to see. */
    @Component({ selector: 'app-derived' })
    export class Derived extends Base {
      /** Own. */
      static readonly OWN = 'own';
      /** Value. */
      get value(): number { return 1; }
      set value(value: number) {}
      constructor(readonly name: string) { super(); }
    }
    /**
     * A service.
     * @see Base
     */
    @Injectable()
    export class Service {}
    export class Leaf extends Service {}
    /** Options. */
    export interface Options<T> extends Partial<T> {
      /** Size. */
      size?: number;
      /** Opens it. */
      open(value: string): boolean;
      (value: string): number;
    }
    /**
     * Converts a value.
     * @param value - The value.
     * @returns The array.
     */
    export function asList<T>(value: T | T[]): T[];
    export function asList(value: unknown): unknown[] { return [value]; }
    /** A shape. */
    export type Shape<T> = { width: number; height: T };
    /** A constant. */
    export const LIMIT: number = 3;
    /** A parent. */
    export interface Parent { /** Shared. */ shared: string }
    /** A child with properties only. */
    export interface Child extends Parent { /** Own. */ own: number }
    /** Directions. */
    export enum Direction { Up = 'up', Down = 'down' }
    `,
  );
  const source = project.getSourceFileOrThrow('api.ts');
  const declarations: SupportedDeclaration[] = [
    source.getClassOrThrow('Base'),
    source.getClassOrThrow('Derived'),
    source.getClassOrThrow('Service'),
    source.getInterfaceOrThrow('Options'),
    source.getFunctionOrThrow('asList'),
    source.getTypeAliasOrThrow('Shape'),
    source.getVariableDeclarationOrThrow('LIMIT'),
    source.getInterfaceOrThrow('Child'),
    source.getEnumOrThrow('Direction'),
  ];
  const render = (template: string, declaration: SupportedDeclaration) =>
    withIndexedDerivedClasses(declaration, project, () =>
      renderApiTemplate(
        template,
        {
          declaration,
          docNode: Node.isVariableDeclaration(declaration)
            ? declaration.getVariableStatement()
            : declaration,
          templateName: kebabCase(declaration.getKindName()),
          scope: { name: '@scope/lib' },
        },
        templates,
        new TrackedFiles(),
        (text) => (text ? `<p>${text}</p>` : ''),
      ),
    );
  // The builder loads @ng-doc/utils lazily (it is ESM), as here.
  const anchors = async (html: string) =>
    (
      await (
        await import('@ng-doc/utils')
      ).processHtml(html, { headings: ['h1', 'h2', 'h3', 'h4'], route: 'api/x' })
    ).anchors
      .map(({ anchorId, anchor, title, type }) => `${type} ${anchorId} ${anchor} ${title}`)
      .sort();

  test.each(declarations.map((declaration) => [declaration.getName(), declaration] as const))(
    '%s keeps the anchors of the per-section layout',
    async (_, declaration) => {
      const legacy = await anchors(
        render('api-header.html.nunj', declaration) +
          render('api-page-content.html.nunj', declaration),
      );
      const symbol = await anchors(
        render('symbol/header.html.nunj', declaration) +
          render('symbol/page.html.nunj', declaration),
      );

      expect(symbol).toEqual(legacy);
      expect(symbol.length).toBeGreaterThan(0);
    },
  );

  test('pages of every kind render the declaration panel and their sections', () => {
    const page = (name: string) =>
      render(
        'symbol/page.html.nunj',
        declarations.find((declaration) => declaration.getName() === name) as SupportedDeclaration,
      );

    // Derived classes leave See Also for the Extended by list, which keeps the anchor without
    // `@see` tags; with them, See Also keeps its heading.
    expect(page('Base')).toMatch(
      /<dl class="ng-doc-api-extended" indexable="false" dataSlug="See Also" dataSlugType="heading">\s*<dt>Extended by <span class="ng-doc-members-count">1<\/span><\/dt>\s*<dd><code>Derived<\/code><\/dd>/,
    );
    expect(page('Base')).not.toContain('(extended)');
    expect(page('Service')).toMatch(/<dl class="ng-doc-api-extended" indexable="false">/);
    expect(page('Service')).toContain('<h2>See Also</h2>');
    expect(page('asList')).toMatch(/dataSlug="Presentation" dataSlugType="heading"/);
    expect(page('asList')).toContain('<h2>Returns</h2>');
    expect(page('asList')).toContain('<h2>Overloads</h2>');
    expect(page('Shape')).toMatch(/type Shape = \{/);
    expect(page('Shape')).toMatch(/data-group="properties" data-name="width"/);
    expect(page('LIMIT')).toMatch(/const LIMIT: number;/);
    expect(page('Direction')).toMatch(
      /data-name="Up" dataSlug="Up" dataSlugType="member">[\s\S]*Up<\/span> = <code>&quot;up&quot;<\/code>/,
    );
    // One group: no tabs, only the filter, and one Members heading (the group row's), as in the
    // per-section layout.
    expect(page('Direction')).not.toContain('role="tablist"');
    expect(page('Direction').match(/>Members<\/h[23]>/g)).toHaveLength(1);
    // One group with inherited members keeps the tabs, so the Inherited tab stays reachable.
    expect(page('Child')).toContain('data-ng-doc-members-tab="inherited"');
    expect(page('Derived')).toContain('role="tablist"');
  });
});
