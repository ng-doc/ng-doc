import {asArray} from '../../../helpers';
import {NgDocEntity} from '../abstractions/entity';

/**
 *
 * @param entities
 */
export function buildCandidates(entities: NgDocEntity | NgDocEntity[]): NgDocEntity[] {
	return asArray(
		new Set(
			asArray(entities)
				.map((buildable: NgDocEntity) => [buildable, ...buildable.buildCandidates])
				.flat(),
		),
	);
}
