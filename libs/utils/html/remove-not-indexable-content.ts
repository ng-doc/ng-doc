import {rehype} from 'rehype';
import {VFileWithOutput} from 'unified';

import removeNotIndexableContentPlugin from './plugins/remove-not-indexable-content.plugin';

/**
 *
 * @param html
 */
export async function removeNotIndexableContent(html: string): Promise<string> {
	return rehype()
		.use(removeNotIndexableContentPlugin)
		.process(html)
		.then((file: VFileWithOutput<string>) => file.toString());
}
