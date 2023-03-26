import {isPageEntity, isRouteEntity} from '../../helpers';
import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocEntity} from '../entities/abstractions/entity';
import autolinkHeading from './html-plugins/autolink-headings';
import keywordsProcessor from './html-plugins/keywords-processor';
import markElements from './html-plugins/mark-elements';
import slugger from './html-plugins/slugger';

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
			.use(require('rehype-highlight'), {ignoreMissing: true})
			.use(slugger, isPageEntity(entity) ? entity.context.config.guide?.anchorHeadings : undefined)
			.use(require('rehype-minify-whitespace'))
			.use(autolinkHeading, isRouteEntity(entity) ? entity.fullRoute : undefined)
			.use(keywordsProcessor, entity.builder.entities, isRouteEntity(entity) ? entity : undefined)
			.use(markElements)
			.processSync(content.content)
			.toString(),
	};
}
