import { ClassDeclaration } from 'ts-morph';

import { forAllClasses } from './for-all-classes';

/**
 *
 * @param cls
 * @param condition
 */
export function findBaseClass(
  cls: ClassDeclaration,
  condition: (cls: ClassDeclaration) => boolean,
): ClassDeclaration | undefined {
  let baseClass: ClassDeclaration | undefined;

  forAllClasses(cls, (c: ClassDeclaration) => {
    if (c !== cls && condition(c)) {
      baseClass = c;

      return true;
    }

    return false;
  });

  return baseClass;
}
