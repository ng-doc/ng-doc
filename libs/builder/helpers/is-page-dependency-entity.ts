import {NgDocPageDependenciesEntity} from '../engine/entities/page-dependencies.entity';
import {Constructable} from '../types';

/**
 *
 * @param dependency
 */
export function isPageDependencyEntity(
	dependency: InstanceType<Constructable>,
): dependency is NgDocPageDependenciesEntity {
	return dependency instanceof NgDocPageDependenciesEntity;
}
