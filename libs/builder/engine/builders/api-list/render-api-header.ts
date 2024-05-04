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

  return renderTemplate('./api-header.html.nunj', {
    context: {
      declaration: metadata.entry.declaration,
      scope: metadata.entry.scope,
      Node: Node,
    },
  });
}
