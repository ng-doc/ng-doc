import { asArray } from '@ng-doc/core';
import { CallSignatureDeclaration, InterfaceDeclaration } from 'ts-morph';

import { forAllInterfaces } from '../interface';
import { getCallSignatureName } from './get-call-signature-name';

/**
 *
 * @param int
 */
export function getInterfaceCallSignatures(int: InterfaceDeclaration): CallSignatureDeclaration[] {
  const callSignatures: Map<string, CallSignatureDeclaration> = new Map<
    string,
    CallSignatureDeclaration
  >();

  forAllInterfaces(int, (i: InterfaceDeclaration) => {
    i.getCallSignatures().forEach((callSignature: CallSignatureDeclaration) => {
      const name: string = getCallSignatureName(callSignature);

      if (!callSignatures.get(name)) {
        callSignatures.set(name, callSignature);
      }
    });
  });

  return asArray(callSignatures.values());
}
