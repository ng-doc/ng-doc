import { isPresent } from '@ng-doc/core';
import { ClassDeclaration, ObjectLiteralExpression } from 'ts-morph';

import { getPlaygroundById } from './get-playground-by-id';
import { getPlaygroundsExpression } from './get-playgrounds-expression';
import { getPlaygroundsIds } from './get-playgrounds-ids';
import { getTargetForPlayground } from './get-target-for-playground';

/**
 *
 * @param objectExpression
 */
export function getPlaygroundsClassDeclarations(
  objectExpression: ObjectLiteralExpression,
): ClassDeclaration[] {
  const playgroundExpression = getPlaygroundsExpression(objectExpression);

  if (playgroundExpression) {
    const ids = getPlaygroundsIds(playgroundExpression);

    return ids
      .map((id) => {
        const playground = getPlaygroundById(playgroundExpression, id);

        return playground ? getTargetForPlayground(playground) : null;
      })
      .filter(isPresent);
  }

  return [];
}
