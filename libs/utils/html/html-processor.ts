import {NgDocEntityAnchor, NgDocHeading} from '@ng-doc/core';
import twig from 'highlight.js/lib/languages/twig';
import rehypeFormat from 'rehype-format';
import rehypeHighlight from 'rehype-highlight';
import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import {unified, VFileWithOutput} from 'unified';

import autolinkHeadingPlugin from './plugins/autolink-headings.plugin';
import codeBlockLinesPlugin from './plugins/code-block-lines.plugin';
import highlightCodeLines from './plugins/highlight-code-lines';
import sluggerPlugin from './plugins/slugger.plugin';

export interface NgDocHtmlProcessorConfig {
	headings?: NgDocHeading[];
	route?: string;
	raiseError: (e: Error) => void;
	addAnchor: (anchor: NgDocEntityAnchor) => void;
}

/**
 *
 * @param html
 * @param config
 */
export async function htmlProcessor(html: string, config: NgDocHtmlProcessorConfig): Promise<string> {
	return unified()
		.use(rehypeParse, {fragment: true})
		.use(rehypeStringify)
		.use(rehypeFormat)
		.use(rehypeHighlight, {ignoreMissing: true, languages: {twig}})
		.use(codeBlockLinesPlugin)
		.use(highlightCodeLines)
		.use(sluggerPlugin, config.addAnchor, config.headings)
		.use(rehypeMinifyWhitespace)
		.use(autolinkHeadingPlugin, config.route)
		.process(html)
		.then((file: VFileWithOutput<string>) => file.toString());
}
