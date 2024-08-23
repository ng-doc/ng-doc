import { rehype } from 'rehype';

import removeNotIndexableContentPlugin from './plugins/remove-not-indexable-content.plugin';

/**
 *
 * @param html
 */
export async function removeNotIndexableContent(html: string): Promise<string> {
  return rehype()
    .use(removeNotIndexableContentPlugin)
    .process(html)
    .then((file) => file.toString());
}
