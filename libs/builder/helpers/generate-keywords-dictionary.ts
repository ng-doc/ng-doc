import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocKeywordEntity} from '../interfaces';
import {isRouteEntity} from './entity-type';

/**
 *
 * @param entities
 */
export function generateKeywordsDictionary(entities: NgDocEntity[]): Record<string, NgDocKeywordEntity> {
	const dictionary: Record<string, NgDocKeywordEntity> = {};

	entities
		.filter(isRouteEntity)
		.forEach((entity: NgDocRouteEntity<unknown>) => {
			entity.keywords
				.forEach((keyword: string) => {
					if (!dictionary[keyword]) {
						dictionary[keyword] = {
							title: entity.title,
							path: entity.fullRoute,
						}
					}
				})
		});

	return dictionary;
}
