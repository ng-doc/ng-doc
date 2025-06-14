import { asArray } from '@ng-doc/core';
import { InterfaceDeclaration, PropertySignature } from 'ts-morph';

import { forAllInterfaces } from '../interface';

/**
 *
 * @param int
 */
export function getInterfaceProperties(int: InterfaceDeclaration): PropertySignature[] {
  const properties: Map<string, PropertySignature> = new Map<string, PropertySignature>();

  forAllInterfaces(int, (i: InterfaceDeclaration) => {
    i.getProperties().forEach((property: PropertySignature) => {
      const name: string = property.getName();

      if (!properties.get(name)) {
        properties.set(name, property);
      }
    });
  });

  return asArray(properties.values());
}
