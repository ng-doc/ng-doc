import { ParentApiRelation, ParentRelation } from '../types';

/**
 *
 * @param relation
 */
export function mapParentRelation(relation?: ParentRelation): ParentApiRelation | undefined {
  return relation
    ? { parent: relation.parent.getName() ?? '[Unknown]', relation: relation.relation }
    : undefined;
}
