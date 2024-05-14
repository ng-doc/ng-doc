import { EMPTY_FUNCTION, NgDocPageAnchor } from '@ng-doc/core';

import { NgDocEntity } from '../engine/entities/abstractions/entity';
import { isRouteEntity } from './entity-type';
import { importEsm } from './import-esm';

type Utils = typeof import('@ng-doc/utils');

/**
 * Processes html content for the current entity
 * @param entity - The current entity
 * @param html - The html content to process
 */
export async function processHtml(html: string, entity: NgDocEntity): Promise<string> {
  const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

  return utils.htmlProcessor(html, {
    headings: entity?.context.config.guide?.anchorHeadings,
    route: isRouteEntity(entity) ? entity.fullRoute : undefined,
    raiseError: entity?.warnings.push.bind(entity.warnings) ?? EMPTY_FUNCTION,
    addAnchor: (anchor: NgDocPageAnchor) =>
      isRouteEntity(entity) ? entity.anchors.push(anchor) : undefined,
  });
}
