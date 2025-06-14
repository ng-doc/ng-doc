import { ClassDeclaration } from 'ts-morph';

import { forAllClasses } from './for-all-classes';

/**
 *
 * @param cls
 * @param condition
 */
export function findClass(
  cls: ClassDeclaration,
  condition: (c: ClassDeclaration) => boolean,
): ClassDeclaration | undefined {
  let baseClass: ClassDeclaration | undefined;

  forAllClasses(cls, (c: ClassDeclaration) => {
    if (condition(c)) {
      baseClass = c;

      return true;
    }

    return false;
  });

  return baseClass;
}
