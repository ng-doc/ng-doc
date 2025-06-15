import { NgDocPage, NgDocPlaygroundControlConfig, NgDocPlaygroundProperties } from '@ng-doc/core';
import { ObjectLiteralExpression } from 'ts-morph';

import {
  buildPlaygroundMetadata,
  getPlaygroundById,
  getPlaygroundsExpression,
  getPlaygroundsIds,
} from '../../../helpers';
import { NgDocPlaygroundMetadata } from '../../../interfaces';

/**
 *
 * @param page
 * @param objectExpression
 */
export function getPlaygroundMetadata(
  page: NgDocPage,
  objectExpression: ObjectLiteralExpression,
): Record<string, NgDocPlaygroundMetadata> {
  const expression = getPlaygroundsExpression(objectExpression);

  if (expression) {
    return getPlaygroundsIds(expression).reduce(
      (metadata: Record<string, NgDocPlaygroundMetadata>, id: string) => {
        if (expression) {
          const playground: ObjectLiteralExpression | undefined = getPlaygroundById(expression, id);

          if (playground) {
            metadata[id] = buildPlaygroundMetadata(
              id,
              playground,
              controlsToProperties(page.playgrounds?.[id]?.controls ?? {}),
            );
          }
        }
        return metadata;
      },
      {},
    );
  }

  return {};
}

/**
 *
 * @param controls
 */
function controlsToProperties(
  controls: Record<string, string | NgDocPlaygroundControlConfig>,
): NgDocPlaygroundProperties {
  return Object.entries(controls).reduce(
    (
      properties: NgDocPlaygroundProperties,
      [name, value]: [string, string | NgDocPlaygroundControlConfig],
    ) => {
      properties[name] = {
        inputName: typeof value === 'string' ? name : value.alias ?? name,
        type: typeof value === 'string' ? value : value.type,
        description: typeof value === 'string' ? undefined : value.description ?? undefined,
        options: typeof value === 'string' ? undefined : value.options ?? undefined,
        isManual: true,
      };

      return properties;
    },
    {},
  );
}
