import { ClassDeclaration, ClassDeclarationStructure } from 'ts-morph';

import { forAllClasses } from '../class';

/**
 *
 * @param declaration
 * @param get
 * @param getKey
 * @param filter
 */
export function getAllMembers<T>(
  declaration: ClassDeclaration,
  get: (structure: ClassDeclarationStructure) => T[],
  getKey: (member: T) => string,
  filter?: (structure: T, cls: ClassDeclaration) => boolean,
): T[] {
  const members = new Map<string, T>();

  forAllClasses(declaration, (cls) => {
    const structure = cls.getStructure();
    const clsMembers = get(structure);

    clsMembers.forEach((member) => {
      const key = getKey(member);
      if (!members.has(key) && (!filter || filter(member, cls))) {
        members.set(key, member);
      }
    });
  });

  return Array.from(members.values());
}
