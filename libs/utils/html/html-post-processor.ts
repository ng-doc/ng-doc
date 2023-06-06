import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import {unified, VFileWithOutput} from 'unified';

import keywordsPlugin, {AddKeyword, GetKeyword} from './plugins/keywords.plugin';
import markCodeBlocksPlugin from './plugins/mark-code-blocks.plugin';
import markElementsPlugin from './plugins/mark-elements.plugin';

export interface NgDocHtmlPostProcessorConfig {
	raiseError: (e: Error) => void;
	addUsedKeyword?: AddKeyword;
	addPotentialKeyword?: AddKeyword;
	getKeyword?: GetKeyword;
}

/**
 *
 * @param html
 * @param config
 */
export async function htmlPostProcessor(html: string, config: NgDocHtmlPostProcessorConfig): Promise<string> {
	return unified()
		.use(rehypeParse, {fragment: true})
		.use(rehypeStringify)
		.use(keywordsPlugin, config)
		.use(markElementsPlugin)
		.use(markCodeBlocksPlugin)
		.process(html)
		.then((file: VFileWithOutput<string>) => file.toString());
}
