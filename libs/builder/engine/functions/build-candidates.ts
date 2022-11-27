import {asArray} from '@ng-doc/core';

import {isRouteEntity} from '../../helpers';
import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocRouteEntity} from '../entities/abstractions/route.entity';

/**
 * Returns list of entities that should be rebuilt based on the provided list (including themselves).
 * List is creating based on relationships between entities and used keywords.
 *
 * @param entities - List of source entities
 * @returns List of entities that should be rebuilt (including source entities)
 */
export function buildCandidates(entities: NgDocEntity[]): NgDocEntity[] {
	const entitiesFromStore: NgDocEntity[] = asArray(entities[0]?.builder.entities.asArray());
	const candidates: NgDocEntity[] = asArray(
		new Set(entities.map((buildable: NgDocEntity) => [buildable, ...buildable.buildCandidates]).flat()),
	);
	const candidatesKeywords: string[] = asArray(
		new Set<string>(
			candidates
				.filter(isRouteEntity)
				.map((candidate: NgDocRouteEntity) => candidate.keywords)
				.flat(),
		),
	);

	const candidatesByKeywords: NgDocEntity[] = entitiesFromStore.filter(
		(entity: NgDocEntity) => isRouteEntity(entity) && candidatesKeywords.some((keyword: string) => entity.usedKeywords.has(keyword))
	);

	return asArray(new Set([...candidates, ...candidatesByKeywords]));
}
