import {NgDocDependenciesEntity} from '../engine/entities/dependencies.entity';
import {Constructable} from '../types';

/**
 *
 * @param dependency
 */
export function isPageDependencyEntity(
	dependency: InstanceType<Constructable>,
): dependency is NgDocDependenciesEntity {
	return dependency instanceof NgDocDependenciesEntity;
}
