import {NgDocDependenciesEntity} from '../engine/entities/dependencies.entity';
import {Constructable} from '../types';

/**
 *
 * @param dependency
 */
export function isDependencyEntity(
	dependency: InstanceType<Constructable>,
): dependency is NgDocDependenciesEntity {
	return dependency instanceof NgDocDependenciesEntity;
}
