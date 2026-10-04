import { kebabCase } from '@ng-doc/core';
import { posix, relative } from 'node:path';
import { type JSDocableNode, Node } from 'ts-morph';

import { declarationFolderName } from '../../helpers/declaration-folder-name';
import { extractSelectors, getPipeName } from '../../helpers/extract-selectors';
import { getKindType } from '../../helpers/get-kind-type';
import type { DeclarationDescriptor, Diagnostic } from '../contracts';
import { apiSummary } from './api-summary';
import { type TrackedFiles, digest, SemanticFailure } from './dependencies';
import type { QueryContext } from './fragments';
import { type Snapshot, type SupportedDeclaration, entryOf } from './program-state';
import { recordLookup } from './recorder';

/**
 * API enumeration: the declarations of an API entry's scopes, with their identities, routes and
 * exported keywords.
 */

/** The node whose JSDoc documents a declaration (a variable's statement). */
export function docNode(node: Node): JSDocableNode | undefined {
  const candidate = Node.isVariableDeclaration(node) ? node.getVariableStatement() : node;
  return candidate && Node.isJSDocable(candidate) ? candidate : undefined;
}

export function supported(node: Node): node is SupportedDeclaration {
  return (
    Node.isClassDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isEnumDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isVariableDeclaration(node) ||
    Node.isTypeAliasDeclaration(node)
  );
}

/** Semantic names and relative source paths survive checkout relocation and scope reordering. */
export function declarationIdentity(
  project: string,
  api: string,
  scope: string,
  workspace: string,
  source: string,
  name: string,
): string {
  return `declaration:${digest(JSON.stringify([project, api, scope, relative(workspace, source).replace(/\\/g, '/'), name]))}`;
}

/** Finalize routes before any content/keywords are rendered; descriptor identities stay unchanged. */
function disambiguateRoutes(
  declarations: DeclarationDescriptor[],
  workspace: string,
  reservedRoutes: string[],
  diagnostics: Diagnostic[],
): void {
  const groups = new Map<string, DeclarationDescriptor[]>();
  for (const declaration of declarations) {
    const group = groups.get(declaration.route) ?? [];
    group.push(declaration);
    groups.set(declaration.route, group);
  }
  const reserved = new Set([...reservedRoutes, ...groups.keys()]);
  const sourceKey = (declaration: DeclarationDescriptor): string =>
    `${relative(workspace, declaration.source.path).replace(/\\/g, '/')}#${declaration.name}`;
  const compare = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  for (const base of [...groups.keys()].sort()) {
    const group = groups.get(base)!;
    if (group.length < 2) continue;
    group.sort(
      (left, right) => compare(sourceKey(left), sourceKey(right)) || compare(left.id, right.id),
    );
    const canonical = group[group.length - 1];
    const exports = new Map<string, number>();
    for (const declaration of group) {
      for (const key of new Set(declaration.exportedKeywords.map((keyword) => keyword.key))) {
        exports.set(key, (exports.get(key) ?? 0) + 1);
      }
    }
    for (const declaration of group.slice(0, -1)) {
      const hash = digest(sourceKey(declaration));
      let suffix = hash.slice(0, 12);
      let route = `${base}--${suffix}`;
      if (reserved.has(route)) {
        suffix = hash;
        route = `${base}--${suffix}`;
      }
      if (reserved.has(route)) {
        throw new SemanticFailure(
          'SEMANTIC_ROUTE_COLLISION',
          `Cannot allocate a unique route for ${sourceKey(declaration)}: ${route} is already reserved`,
          declaration.source,
        );
      }
      reserved.add(route);
      declaration.route = route;
      declaration.exportedKeywords = declaration.exportedKeywords.map((keyword) => ({
        ...keyword,
        key:
          keyword.key === declaration.name || exports.get(keyword.key)! > 1
            ? `${keyword.key}--${suffix}`
            : keyword.key,
        path: route,
      }));
      diagnostics.push({
        code: 'SEMANTIC_ROUTE_DISAMBIGUATED',
        severity: 'warning',
        stage: 'semantic',
        message: `${sourceKey(declaration)} uses ${route}; ${sourceKey(canonical)} retains ${base}`,
        source: declaration.source,
        related: [
          {
            message: 'Canonical declaration retains the existing public route and shared keywords',
            source: canonical.source,
          },
        ],
      });
    }
  }
}

/**
 * The public declarations of an API entry, in scope and export order, registered in the snapshot
 * for later fragment requests.
 */
export function enumerateApi(
  state: Snapshot,
  entryId: string,
  files: TrackedFiles,
  diagnostics: Diagnostic[],
  context: QueryContext,
): DeclarationDescriptor[] {
  const entry = entryOf(state, entryId);
  if (entry.kind !== 'api')
    throw new SemanticFailure('SEMANTIC_ENTRY_KIND', `${entryId} is not an API entry`);
  const result: DeclarationDescriptor[] = [];
  const seen = new Set<string>();
  for (const scope of entry.scopes)
    for (const path of state.scopes.get(`${entry.id}:${scope.id}`) ?? []) {
      recordLookup(path);
      const source = state.project.getSourceFileOrThrow(path);
      for (const [name, nodes] of source.getExportedDeclarations()) {
        const candidates = nodes.filter(supported);
        if (!candidates.length) {
          // API globs can include config files and namespaces. Legacy findDeclarations
          // skips these rather than failing all supported declarations in the scope.
          diagnostics.push({
            code: 'SEMANTIC_DECLARATION_KIND',
            severity: 'info',
            stage: 'semantic',
            message: `Skipped unsupported exported declaration ${name}`,
            source: { path },
          });
          continue;
        }
        const publicNodes = candidates.filter(
          (candidate) =>
            !context
              .docs(candidate.getSourceFile().getFilePath(), files)
              .hasJsDocTag(docNode(candidate), 'internal'),
        );
        const node = publicNodes[0];
        const routeNode = publicNodes.at(-1);
        if (!node || !routeNode) continue;
        // Legacy fixes identity/route before refresh, then renders the first exported
        // declaration. Preserve merged-interface members and overload documentation.
        const config = state.discovery.configuration;
        const declarationName = node.getName() ?? name;
        const id = declarationIdentity(
          config.projectId,
          entry.id,
          scope.id,
          config.workspaceRoot,
          node.getSourceFile().getFilePath(),
          declarationName,
        );
        if (seen.has(id)) continue;
        seen.add(id);
        const route = posix.join(
          config.routePrefix,
          entry.route,
          declarationFolderName(routeNode),
          scope.route,
          declarationName,
        );
        const summary = apiSummary(node, docNode(node));
        const descriptor: DeclarationDescriptor = {
          id,
          apiEntryId: entry.id,
          scopeId: scope.id,
          source: { path: node.getSourceFile().getFilePath(), line: node.getStartLineNumber() },
          name: declarationName,
          kind: kebabCase(node.getKindName()),
          ...(getKindType(node) ? { apiListType: getKindType(node)! } : {}),
          signature: summary.signature,
          ...(summary.description ? { description: summary.description } : {}),
          route,
          breadcrumbs: [entry.title, scope.name, declarationName],
          exportedKeywords: [{ key: declarationName, title: declarationName, path: route }],
        };
        for (const selector of extractSelectors(node)) {
          const key = selector.match(/\[([\w-]+)\]$/)?.[1] ?? selector;
          descriptor.exportedKeywords.push({
            key,
            title: key,
            path: route,
            languages: ['html'],
          });
        }
        const pipe = getPipeName(node);
        if (pipe)
          descriptor.exportedKeywords.push({
            key: pipe,
            title: pipe,
            path: route,
            languages: ['html'],
          });
        state.declarations.set(id, { node, descriptor, scope });
        result.push(descriptor);
      }
    }
  disambiguateRoutes(
    result,
    state.discovery.configuration.workspaceRoot,
    [
      ...state.discovery.entries.map((item) => item.absoluteRoute),
      ...[...state.declarations.values()]
        .filter((item) => item.descriptor.apiEntryId !== entry.id)
        .map((item) => item.descriptor.route),
    ],
    diagnostics,
  );
  return result;
}
