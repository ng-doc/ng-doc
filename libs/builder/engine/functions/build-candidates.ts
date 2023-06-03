import {asArray} from '@ng-doc/core';

import {isRouteEntity} from '../../helpers';
import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocRouteEntity} from '../entities/abstractions/route.entity';
import {NgDocEntityStore} from '../entity-store';

/**
 * Returns list of entities that should be rebuilt based on the provided list (including themselves).
 * List is creating based on relationships between entities and used keywords.
 *
 * @param entityStore
 * @param entities - List of source entities
 * @returns List of entities that should be rebuilt (including source entities)
 */
export function buildCandidates(entityStore: NgDocEntityStore, entities: NgDocEntity[]): NgDocEntity[] {
	/*
	 * If there are no entities to build, return empty array.
	 * This is needed because `candidatesByKeywords` may return outdated entities if there are no entities to build
	 * then the message about outdated keywords will be shown.
	 */
	if (!entities.length) {
		return [];
	}

	const entitiesFromStore: NgDocEntity[] = asArray(entityStore.asArray());
	// Get all candidates from entities and their build candidates
	const candidates: NgDocEntity[] = asArray(
		new Set(entities.map((buildable: NgDocEntity) => [buildable, ...buildable.buildCandidates]).flat()),
	);

	// Get all keywords from candidates
	const candidatesKeywords: string[] = asArray(
		new Set<string>(
			candidates
				.filter(isRouteEntity)
				.map((candidate: NgDocRouteEntity) => candidate.keywords)
				.flat(),
		),
	);

	const candidatesByKeywords: NgDocEntity[] = entitiesFromStore.filter(
		(entity: NgDocEntity) =>
			// Check if entity is route and has keywords that are used by candidates
			candidatesKeywords.some(
				(keyword: string) => entity.potentialKeywords.has(keyword) || entity.usedKeywords.has(keyword),
			) ||
			// Check if one of the used keywords is outdated
			asArray(entity.usedKeywords).some((keyword: string) => !entityStore.getByKeyword(keyword)),
	);

	return asArray(new Set([...candidates, ...candidatesByKeywords])).sort(prioritySort);
}

// Sort entities by parent-child relationship, children should be first, parents should be last
/**
 *
 * @param a
 * @param b
 */
function prioritySort(a: NgDocEntity, b: NgDocEntity): number {
	return b.parentEntities.length - a.parentEntities.length;
}
