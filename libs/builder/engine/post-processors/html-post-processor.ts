// @ts-ignore
import rehypeFormat from 'rehype-format';
import rehypeSlug from 'rehype-slug';

import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocBuilder} from '../builder';
import autolinkHeading from './html-plugins/autolink-headings';


/**
 *
 * @param builder
 * @param content
 */
export function htmlPostProcessor(content: NgDocBuiltOutput): NgDocBuiltOutput {
	return {
		...content,
		content: require('rehype')()
			.use(rehypeFormat)
			.use(rehypeSlug)
			.use(autolinkHeading)
			.processSync(content.content)
			.toString()
	}
}
