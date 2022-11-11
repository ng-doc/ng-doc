import {NgDocEntity} from '../entities/abstractions/entity';

/**
 *
 * @param entities
 */
export function keywordProcessor(entities: Map<string, NgDocEntity>): any {
	return (tree: any) => {
		return tree;
	}
}
