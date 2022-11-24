import {isRouteEntity} from '../../helpers';
import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocEntity} from '../entities/abstractions/entity';
import autolinkCode from './html-plugins/autolink-code';
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
			.use(require('rehype-format'))
			.use(require('rehype-highlight'))
			.use(require('rehype-slug'))
			.use(autolinkHeading, isRouteEntity(entity) ? entity.fullRoute : undefined)
			.use(autolinkCode, entity.builder.entities)
			.processSync(content.content)
			.toString()
	}
}
