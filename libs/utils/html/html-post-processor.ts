import {NgDocHeading} from '@ng-doc/core';
import twig from 'highlight.js/lib/languages/twig';
import {rehype} from 'rehype';
import rehypeFormat from 'rehype-format';
import rehypeHighlight from 'rehype-highlight';
import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import {VFileWithOutput} from 'unified';

import autolinkHeadingPlugin from './plugins/autolink-headings.plugin';
import keywordsPlugin, {AddUsedKeyword, GetKeyword} from './plugins/keywords.plugin';
import markCodeBlocksPlugin from './plugins/mark-code-blocks.plugin';
import markElementsPlugin from './plugins/mark-elements.plugin';
import sluggerPlugin from './plugins/slugger.plugin';

export interface NgDocHtmlPostProcessorConfig {
	headings?: NgDocHeading[];
	route?: string;
	addUsedKeyword?: AddUsedKeyword;
	getKeyword?: GetKeyword;
}

/**
 *
 * @param html
 * @param config
 */
export async function htmlPostProcessor(html: string, config: NgDocHtmlPostProcessorConfig): Promise<string> {
	return rehype()
		.use(rehypeFormat)
		.use(rehypeHighlight, {ignoreMissing: true, languages: {twig}})
		.use(sluggerPlugin, config.headings)
		.use(rehypeMinifyWhitespace)
		.use(autolinkHeadingPlugin, config.route)
		.use(keywordsPlugin, config.addUsedKeyword, config.getKeyword)
		.use(markElementsPlugin)
		.use(markCodeBlocksPlugin)
		.process(html)
		.then((file: VFileWithOutput<string>) => file.toString());
}
