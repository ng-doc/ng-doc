import { Node } from 'ts-morph';

import { renderTemplate } from '../../nunjucks';
import { DeclarationEntry, EntryMetadata } from '../interfaces';

interface Config {
  metadata: EntryMetadata<DeclarationEntry>;
}

/**
 *
 * @param config
 */
export function renderApiHeader(config: Config): string {
  const { metadata } = config;
  const declaration = metadata.entry.declaration;

  return renderTemplate('./api-header.html.nunj', {
    context: {
      declaration,
      docNode: Node.isVariableDeclaration(declaration)
        ? declaration.getVariableStatement()
        : declaration,
      scope: metadata.entry.scope,
      Node: Node,
    },
  });
}
