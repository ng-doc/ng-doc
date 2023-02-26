import {isRouteEntity} from '../../helpers';
import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocEntity} from '../entities/abstractions/entity';
import autolinkHeading from './html-plugins/autolink-headings';
import keywordsProcessor from './html-plugins/keywords-processor';

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
			.use(require('rehype-format'))
			.use(require('rehype-highlight'))
			.use(require('rehype-slug'))
			.use(require('rehype-minify-whitespace'))
			.use(autolinkHeading, isRouteEntity(entity) ? entity.fullRoute : undefined)
			.use(keywordsProcessor, entity.builder.entities, isRouteEntity(entity) ? entity : undefined)
			.processSync(content.content)
			.toString(),
	};
}
