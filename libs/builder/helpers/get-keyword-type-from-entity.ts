import { NgDocKeywordType } from '@ng-doc/core';

import { NgDocRouteEntity } from '../engine/entities/abstractions/route.entity';

/**
 *
 * @param entity
 */
export function getKeywordTypeFromEntity(entity: NgDocRouteEntity): NgDocKeywordType | undefined {
  return 'link';
}
