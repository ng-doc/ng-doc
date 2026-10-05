import { kebabCase } from '@ng-doc/core';
import { resolve } from 'node:path';

// A deep import: the utils barrel would load the HTML pipeline's dependencies with this chunk.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { minify } from '../../../utils/html/minify';
import type { ApiScopeDescriptor, SemanticFragment, SemanticFragmentRequest } from '../contracts';
import type { FootprintScopeKind } from '../kernel/footprint';
import { docNode, supported } from './api-enumeration';
import { normalize, SemanticFailure, TrackedFiles } from './dependencies';
import { withIndexedDerivedClasses } from './derived-classes';
import { formatting } from './formatting';
import { ownedOverlap } from './program-builder';
import { trackProgram } from './program-observations';
import { type ResettableProgram, withPinnedRoots } from './program-retention';
import { type Snapshot, type SupportedDeclaration, entryOf } from './program-state';
import { type SemanticRecorder, recordLookup } from './recorder';
import { type createJsDoc, renderApiTemplate } from './rendering';
import { canonicalTypeText } from './type-text';

/**
 * Semantic fragments: the entry JSDoc value, the JSDoc fragments of a declaration, and the
 * rendered API templates.
 */

/** The service's rendering helpers a query needs, bound to the query's observations. */
export interface QueryContext {
  docs(source: string, files: TrackedFiles): ReturnType<typeof createJsDoc>;
  markdown(text: string, source: string, files: TrackedFiles): string;
}

export interface FragmentContext extends QueryContext {
  recorder: SemanticRecorder;
  /** Whether queries record semantic closures (their footprint states the program files read). */
  scoped?(): boolean;
  /** Whether whole-program queries share one tracking of the program (`trackWholeProgram`). */
  trackedProgramReuse?: boolean;
  /** The API template root (the option, or the shipped templates). */
  templateRoot(): string;
}

/**
 * The recorder scope of a fragment request: its phase kind and its unit key.
 * @param request
 */
export function fragmentScope(request: SemanticFragmentRequest): [FootprintScopeKind, string] {
  return request.kind === 'entry-doc'
    ? ['entry-doc', request.entryId]
    : [
        'renderFragment',
        `${request.kind}:${request.target === 'declaration' ? request.declarationId : `${request.entryId}:${request.declarationPath}`}`,
      ];
}

/**
 * The declaration a request names: an enumerated declaration id, or `path/to/file.ts#exportName`
 * relative to the workspace (which may add the file to the Project and mark it mutated).
 * @param state
 * @param request
 * @param files
 * @param context
 */
function requestedDeclaration(
  state: Snapshot,
  request: Exclude<SemanticFragmentRequest, { kind: 'entry-doc' }>,
  files: TrackedFiles,
  context: FragmentContext,
): { node: SupportedDeclaration; scope?: ApiScopeDescriptor } {
  const { recorder } = context;
  if (request.target === 'declaration') {
    const declaration = state.declarations.get(request.declarationId);
    if (!declaration)
      throw new SemanticFailure(
        'SEMANTIC_DECLARATION_MISSING',
        `Unknown declaration ${request.declarationId}; enumerateApi must run after synchronize`,
      );
    // The declaration's own file is always in the footprint.
    recordLookup(declaration.node.getSourceFile().getFilePath());
    return { node: declaration.node, scope: declaration.scope };
  }
  entryOf(state, request.entryId);
  const [file, name, extra] = request.declarationPath.split('#');
  if (!file || !name || extra)
    throw new SemanticFailure('SEMANTIC_DECLARATION_PATH', 'Expected path/to/file.ts#exportName');
  const path = normalize(resolve(state.discovery.configuration.workspaceRoot, file));
  if (state.owned.has(path)) throw ownedOverlap('API declaration path', path, state.owned);
  files.read(path);
  recordLookup(path);
  let source = state.project.getSourceFile(path);
  const added = !source;
  if (!source) {
    state.mutated = true;
    const project = state.project;
    source = withRootsAppended(project, path, () => {
      const added = project.addSourceFileAtPath(path);
      project.resolveSourceFileDependencies();
      return added;
    });
  }
  // A scoped query's closure states what it read, unless it re-created the program: then, as
  // without scoping, it depends on the whole re-created program.
  if (added || !context.scoped?.()) trackWholeProgram(state, files, context);
  // Adding a source file re-created the program: install the checker channel on it.
  recorder.ensure(state.project);
  // ... and the canonical union order of printed types (`type-text.ts`).
  canonicalTypeText(state.project.getProgram().compilerObject.getTypeChecker());
  const declaration = source.getExportedDeclarations().get(name)?.[0];
  if (!declaration || !supported(declaration))
    throw new SemanticFailure(
      'SEMANTIC_DECLARATION_MISSING',
      `Cannot resolve exported declaration ${request.declarationPath}`,
      { path },
    );
  return { node: declaration };
}

/**
 * Renders one fragment request against the snapshot, recording its reads in `files`.
 * @param state
 * @param request
 * @param files
 * @param context
 */
export function renderFragment(
  state: Snapshot,
  request: SemanticFragmentRequest,
  files: TrackedFiles,
  context: FragmentContext,
): SemanticFragment {
  if (request.kind === 'entry-doc') {
    const entry = entryOf(state, request.entryId);
    recordLookup(entry.source.path);
    const source = state.project.getSourceFileOrThrow(entry.source.path);
    const declaration = source.getExportedDeclarations().get('default')?.[0];
    const docs = context.docs(entry.source.path, files);
    const node = declaration ? docNode(declaration) : undefined;
    return {
      format: 'value',
      value: { description: docs.getJsDocDescription(node), tags: docs.getAllJsDocTags(node) },
    };
  }
  const { node, scope } = requestedDeclaration(state, request, files, context);
  const source = node.getSourceFile().getFilePath();
  const docs = context.docs(source, files);
  const documented = docNode(node);
  if (request.kind === 'js-doc')
    return { format: 'html', value: docs.getJsDocDescription(documented) };
  if (request.kind === 'js-doc-tag')
    return { format: 'html', value: docs.getJsDocTag(documented, request.tag ?? '') };
  if (request.kind === 'js-doc-tags')
    return { format: 'value', value: docs.getJsDocTags(documented, request.tag ?? '') };
  if (request.kind === 'js-doc-has-tag')
    return { format: 'value', value: docs.hasJsDocTag(documented, request.tag ?? '') };
  const kind = kebabCase(node.getKindName());
  // Declaration pages use the symbol view (`templates/symbol`); the legacy engine renders the
  // per-section layout of `api-page-content` and `api-header`.
  const template =
    request.kind === 'api-page'
      ? 'symbol/page.html.nunj'
      : request.kind === 'api-header'
        ? 'symbol/header.html.nunj'
        : request.kind === 'api-details'
          ? `api/details/${kind}.html.nunj`
          : `api/${kind}.html.nunj`;
  // See Also lists derived classes; serve them from one heritage index per program.
  // Signatures are formatted with the generation's format cache (`./format-cache`).
  const html = withIndexedDerivedClasses(node, state.project, () =>
    formatting(() =>
      renderApiTemplate(
        template,
        {
          declaration: node,
          docNode: documented,
          templateName: kind,
          scope,
          // The legacy engine passes no such flag, so the shared templates keep protected members.
          hideProtectedMembers: state.discovery.configuration.apiProtectedMembers === false,
          ...(request.kind === 'api'
            ? {
                hideDescription: true,
                hideSeeAlso: true,
                hideUsageNotes: true,
                hideRemarks: true,
                hideExamples: true,
              }
            : {}),
        },
        context.templateRoot(),
        files,
        (text) => context.markdown(text, source, files),
        state.discovery.configuration.workspaceRoot,
      ),
    ),
  );
  return {
    format: 'html',
    value:
      request.kind === 'api'
        ? minify(
            `<ng-doc-keyword-scope id="${node.getSymbol()?.getName()}" title="${node.getSymbol()?.getName()}">${html}</ng-doc-keyword-scope>`,
          )
        : request.kind === 'api-details'
          ? minify(html)
          : html,
  };
}

/**
 * Records the whole program into a query's dependencies, as `trackProgram` does.
 *
 * Tracking a program resolves every import of every file again (about a second for the site's own
 * program), and a query that depends on the whole program (every API embed of a production
 * generation) used to pay it each time. The tracking is a function of the program and of the
 * files it probes, so it is made once per program of this synchronization and its dependencies are
 * added to each such query: the query records exactly what tracking the program into it records.
 * A query that adds a source file re-creates the program, which is tracked again. The files are
 * probed once per generation, so every query of a generation records the same state of them; an
 * edit made during the generation is found by the next one, as any other recorded read is.
 * @param state The synchronization's snapshot.
 * @param files The query's dependencies.
 * @param context The service's query context.
 */
function trackWholeProgram(state: Snapshot, files: TrackedFiles, context: FragmentContext): void {
  if (context.trackedProgramReuse === false) {
    trackProgram(state.project, files, state.owned);
    return;
  }
  const program = state.project.getProgram().compilerObject;
  if (state.tracked?.program !== program) {
    const tracked = new TrackedFiles();
    trackProgram(state.project, tracked, state.owned);
    state.tracked = { program, dependencies: tracked.all() };
  }
  for (const dependency of state.tracked.dependencies) files.add(dependency);
}

/**
 * Runs `add` with every re-creation of the program pinned to its current root names plus `path`.
 * ts-morph re-creates a changed program from every file in its cache, which reorders the files, and
 * `stableTypeOrdering` orders a union's unnamed types by the program's file order: the queries
 * after the addition would print unions in another order than a generation that never adds the
 * file. Pinned, the existing files keep their order and the added ones come last.
 * @param project
 * @param path
 * @param add
 */
function withRootsAppended<T>(project: Snapshot['project'], path: string, add: () => T): T {
  const program = project.getProgram() as unknown as Partial<ResettableProgram>;
  if (typeof program._reset !== 'function') return add();
  const roots = [...project.getProgram().compilerObject.getRootFileNames(), path];
  let added: T | undefined;
  withPinnedRoots(program as ResettableProgram, roots, () => {
    added = add();
  });
  return added as T;
}
