// @ts-ignore
import rehypeFormat from 'rehype-format';
import rehypeSlug from 'rehype-slug';

import {isRouteEntity} from '../../helpers';
import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocEntity} from '../entities/abstractions/entity';
import autolinkHeading from './html-plugins/autolink-headings';


/**
 *
 * @param builder
 * @param entity
 * @param content
 */
export function htmlPostProcessor(entity: NgDocEntity, content: NgDocBuiltOutput): NgDocBuiltOutput {
	return {
		...content,
		content: require('rehype')()
			.use(rehypeFormat)
			.use(rehypeSlug)
			.use(autolinkHeading, isRouteEntity(entity) ? entity.fullRoute : undefined)
			.processSync(content.content)
			.toString()
	}
}
