import {
  type DocNode,
  DocErrorText,
  DocExcerpt,
  DocPlainText,
  ExcerptKind,
  TSDocParser,
} from '@microsoft/tsdoc';
import { asArray, escapeHtml, kebabCase, objectKeys, unique } from '@ng-doc/core';
import { Marked } from 'marked';
import { dirname, resolve } from 'node:path';
import nunjucks, { type LoaderSource, Environment, Loader } from 'nunjucks';
import { type JSDocableNode, Node } from 'ts-morph';

// A deep import: the utils barrel would load the HTML pipeline's dependencies with this chunk.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { stringifyEntities } from '../../../utils/html/stringify-entities';
import { extractSelectors } from '../../helpers/extract-selectors';
import { filterUselessMembers } from '../../helpers/filter-useless-members';
import { getDeclarationType } from '../../helpers/get-declaration-type';
import { noEmpty } from '../../helpers/no-empty';
import * as presentation from '../../helpers/presentation';
import { removeLinesFromCode } from '../../helpers/remove-lines-from-code';
import * as accessors from '../../helpers/typescript/accessor';
import * as callSignatures from '../../helpers/typescript/call-signature';
import { displayReturnType, displayType } from '../../helpers/typescript/display-type';
import { filterByScope } from '../../helpers/typescript/filter-by-scope';
import { filterByStatic } from '../../helpers/typescript/filter-by-static';
import { firstNodeWithComment } from '../../helpers/typescript/first-node-with-comment';
import { isNamed } from '../../helpers/typescript/is-named';
import * as members from '../../helpers/typescript/member';
import * as methods from '../../helpers/typescript/method';
import { sortByNodesName } from '../../helpers/typescript/node/sort-by-nodes-name';
import * as properties from '../../helpers/typescript/property';
import { parseCodeBlockParams } from '../../parsers/parse-code-block-params';
import { hostPath } from '../kernel/paths';
import { apiDeclaration } from './api-summary';
import type { TrackedFiles } from './dependencies';

export type MarkdownRenderer = (
  markdown: string,
  context: { source: string; read(path: string): string },
) => string;

/** Standalone parity default; a caller may inject another renderer (the `markdown` option). */
export const renderMarkdown: MarkdownRenderer = (text, context) => {
  const renderer = new Marked({
    renderer: {
      code(code: string, language: string | undefined) {
        const options = parseCodeBlockParams(language?.trim() || 'typescript');
        if (options.file)
          code = removeLinesFromCode(
            context
              // The engine's spelling of the snippet path, as every path a reader receives.
              .read(hostPath(resolve(dirname(context.source), options.file)))
              .split(/\r?\n/)
              .slice(options.fileLineStart, options.fileLineEnd)
              .join('\n')
              .trim(),
          );
        const meta = stringifyEntities(
          JSON.stringify({
            name: !options.group ? options.name : undefined,
            icon: !options.group ? options.icon : undefined,
            highlightedlines: JSON.stringify(options.highlightedLines),
          }).replace(/"/g, '\\"'),
        );
        const element = `<pre><code class="language-${options.language ?? 'ts'}" lang="${options.language}" metastring="${meta}">${escapeHtml(code)}</code></pre>`;
        return options.group
          ? `<div><ng-doc-tab group="${options.group}" name="${options.name}" icon="${options.icon ?? ''}" ${options.active ? 'active' : ''}>${element}</ng-doc-tab></div>`
          : element;
      },
      blockquote(quote: string) {
        const match = quote.match(/^<p><strong>(\w+)<\/strong>\s*/);
        return match
          ? `<ng-doc-blockquote type="${match[1].toLowerCase()}">${quote.replace(match[0], '<p>')}</ng-doc-blockquote>`
          : `<ng-doc-blockquote>${quote}</ng-doc-blockquote>`;
      },
      html(html: string, block: boolean | undefined) {
        return block ? html : html.trim();
      },
    },
  });
  return renderer.parse(text, { async: false }) as string;
};

/** Same TSDoc excerpt/status traversal as the legacy Formatter, with an explicit renderer. */
export function createJsDoc(markdown: (text: string) => string) {
  const renderNodes = (nodes: readonly DocNode[]): string => {
    let result = '';
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const next = nodes[index + 1];
      if (
        node instanceof DocErrorText &&
        node.text === '@' &&
        next instanceof DocPlainText &&
        next.text.startsWith('status:')
      ) {
        index++;
        continue;
      }
      if (node instanceof DocExcerpt) result += node.content.toString();
      result += renderNodes(node.getChildNodes());
    }
    return result;
  };
  const parsed = (node?: JSDocableNode) =>
    new TSDocParser().parseString(node?.getJsDocs()[0]?.getText() ?? '').docComment;
  const tags = (node?: JSDocableNode) => {
    const comment = node?.getJsDocs()[0];
    const original = comment?.getStructure().tags ?? [];
    if (!comment || !comment.getText().includes('```')) return original;

    // TypeScript treats decorators inside fences as tags. Locate fences using
    // TSDoc's public excerpts, neutralizing tag delimiters only for this scan:
    // otherwise repeated block tags can discard earlier blocks from its AST.
    const ranges: Array<{ pos: number; end: number }> = [];
    const visit = (node: DocNode): void => {
      if (node instanceof DocExcerpt && node.excerptKind === ExcerptKind.FencedCode_Code)
        ranges.push(node.content.getContainingTextRange());
      node.getChildNodes().forEach(visit);
    };
    visit(new TSDocParser().parseString(comment.getText().replace(/@/g, 'a')).docComment);
    const nativeTags = comment.getTags();
    const validTags = nativeTags.filter((tag) => {
      const start = tag.getStart() - comment.getStart();
      return !ranges.some(({ pos, end }) => start >= pos && start < end);
    });
    if (validTags.length === nativeTags.length) return original;

    // Reassemble spans between genuine tags, retaining any fenced text that
    // TypeScript incorrectly split out of an example or remark.
    const source = comment.getSourceFile().getFullText();
    return validTags.map((tag, index) => ({
      tagName: tag.getTagName(),
      text: source
        .slice(
          tag.getTagNameNode().getEnd(),
          validTags[index + 1]?.getStart() ?? comment.getEnd() - 2,
        )
        .replace(/^ /, '')
        .replace(/^[\t ]*\* ?/gm, '')
        .trimEnd(),
    }));
  };
  const getJsDocDescription = (node?: JSDocableNode) =>
    markdown(renderNodes(parsed(node).summarySection.getChildNodes())).trim();
  const getJsDocTags = (node: JSDocableNode | undefined, name: string) =>
    tags(node)
      .filter((tag) => tag.tagName === name)
      .map((tag) => markdown(String(tag.text ?? '')).trim());
  const getJsDocTag = (node: JSDocableNode | undefined, name: string) =>
    markdown(String(tags(node).find((tag) => tag.tagName === name)?.text ?? '')).trim();
  const hasJsDocTag = (node: JSDocableNode | undefined, name: string) =>
    tags(node).some((tag) => tag.tagName === name);
  const getAllJsDocTags = (node?: JSDocableNode) =>
    tags(node).reduce(
      (all, tag) => {
        (all[tag.tagName] ??= []).push(String(tag.text ?? ''));
        return all;
      },
      {} as Record<string, string[]>,
    );
  const getJsDocParam = (node: JSDocableNode | undefined, name: string) =>
    markdown(
      renderNodes(parsed(node).params.tryGetBlockByName(name)?.content.getChildNodes() ?? []),
    ).trim();
  return {
    getJsDocDescription,
    getJsDocTags,
    getJsDocTag,
    hasJsDocTag,
    getAllJsDocTags,
    getJsDocParam,
  };
}

export type JsDoc = ReturnType<typeof createJsDoc>;

/** Nunjucks internals used exactly as `Template#_compile` uses them (nunjucks 3.2.4). */
interface CompileEnvironment {
  asyncFilters: string[];
  extensionsList: unknown[];
  opts: { dev?: boolean };
}
const { compiler: nunjucksCompiler, lib: nunjucksLib } = nunjucks as unknown as {
  compiler: {
    compile(
      source: string,
      asyncFilters: string[],
      extensions: unknown[],
      name: string,
      opts: object,
    ): string;
  };
  lib: { _prettifyError(path: string, withInternals: boolean | undefined, error: unknown): Error };
};

/**
 * Compiled template code, one entry per template path. An entry is reused only when the
 * template text and every compile input match exactly, so an edited template (in the same or a
 * later generation) always recompiles. The code is environment-independent: nunjucks passes the
 * environment, context and frame to it at render time, as it does for precompiled templates.
 */
const compiledTemplates = new Map<string, { key: string; code: object }>();

/**
 * Returns precompiled code for nunjucks to build a `Template` from; the caller has already
 * recorded the template read. Code is cached only when the environment has no extensions.
 *
 * A template that fails to compile throws here, from the loader, with the error nunjucks itself
 * builds for it (`Template#_compile`'s `(path) [Line, Column]` form), and is never cached. Left to
 * nunjucks, an included or imported template compiles lazily inside a callback render, which
 * reports the error through `asap`: the synchronous render returns partial output and the error
 * escapes later as an uncaught exception. Thrown from the loader, it fails the render
 * synchronously, and each including template prefixes its own path to the message.
 */
function compiledSource(path: string, text: string, environment: CompileEnvironment) {
  const cacheable = !environment.extensionsList.length;
  const key = JSON.stringify([text, environment.asyncFilters, environment.opts]);
  const cached = compiledTemplates.get(path);
  if (cacheable && cached?.key === key) return { type: 'code', obj: cached.code };
  let code: object;
  try {
    code = new Function( // eslint-disable-line no-new-func
      nunjucksCompiler.compile(
        text,
        environment.asyncFilters,
        environment.extensionsList,
        path,
        environment.opts,
      ),
    )();
  } catch (error) {
    compiledTemplates.delete(path);
    throw nunjucksLib._prettifyError(path, environment.opts.dev, error);
  }
  if (cacheable) compiledTemplates.set(path, { key, code });
  return { type: 'code', obj: code };
}

/** The Angular signal function that declares a member, as the symbol view's members table shows it. */
export interface SignalMember {
  /** `input`, `model` or `output`. */
  kind: 'input' | 'model' | 'output';
  /** Whether it is `input.required()` or `model.required()`. */
  required: boolean;
}

/**
 * Tells a signal input, model or output from its initializer (`input()`, `input.required()`,
 * `model()`, `model.required()`, `output()`, `outputFromObservable()`), so the members table
 * shows it as an input or output the way it shows `@Input()` and `@Output()`. It reads only the
 * member's own syntax.
 * @param node - A class member.
 */
export function signalMember(node: Node): SignalMember | undefined {
  const initializer = Node.isPropertyDeclaration(node) ? node.getInitializer() : undefined;
  if (!initializer || !Node.isCallExpression(initializer)) return undefined;
  const callee = initializer.getExpression().getText().replace(/\s+/g, '');
  const match = /^(input|model)(\.required)?$|^(output|outputFromObservable)$/.exec(callee);
  if (!match) return undefined;
  return match[1]
    ? { kind: match[1] as 'input' | 'model', required: Boolean(match[2]) }
    : { kind: 'output', required: false };
}

export function renderApiTemplate(
  template: string,
  context: object,
  root: string,
  files: TrackedFiles,
  markdown: (text: string) => string,
  configDirectory?: string,
): string {
  class TrackedLoader extends Loader {
    getSource(name: string): LoaderSource {
      const path = resolve(root, name);
      // Every use records the template read, including compiled-cache hits.
      const text = files.read(path);
      const src = compiledSource(path, text, environment as unknown as CompileEnvironment);
      // `@types/nunjucks` omits the precompiled `{ type: 'code' }` source form.
      return { src: src as unknown as LoaderSource['src'], path, noCache: true };
    }
  }
  const docs = createJsDoc(markdown);
  const environment = new Environment(new TrackedLoader(), { autoescape: false });
  const filters = {
    ...Object.fromEntries(
      Object.entries(presentation).map(([name, filter]) => [
        name,
        (node: never) => filter(node, configDirectory),
      ]),
    ),
    ...accessors,
    ...methods,
    ...properties,
    ...members,
    ...callSignatures,
    ...docs,
    extractSelectors,
    filterUselessMembers,
    getDeclarationType,
    apiDeclaration,
    signalMember,
    noEmpty,
    displayReturnType,
    displayType,
    filterByScope,
    filterByStatic,
    firstNodeWithComment,
    isNamed,
    sortByNodesName,
    kebabCase,
    objectKeys,
    unique,
    markdownToHtml: markdown,
    excludeByJsDocTags: (nodes: JSDocableNode[], tags: string | string[]) =>
      nodes.filter((node) => !asArray(tags).some((tag) => docs.hasJsDocTag(node, tag))),
  };
  Object.entries(filters).forEach(([name, filter]) => {
    if (typeof filter === 'function') environment.addFilter(name, filter);
  });
  environment.addGlobal('Node', Node);
  return environment.render(template, context);
}
