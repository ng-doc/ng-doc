import {NgDocEntityPlugin} from '../types';

/**
 * Adds the given string to the dependencies of the entity.
 */
export function addToDependenciesPlugin(): NgDocEntityPlugin<string> {
	return {
		id: 'addToDependenciesPlugin',
		implementation: async (data, entity) => {
			entity.dependencies.add(data);

			return data;
		},
	};
}
