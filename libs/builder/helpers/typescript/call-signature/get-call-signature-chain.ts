import { CallSignatureDeclaration, InterfaceDeclaration, Node } from 'ts-morph';

import { forAllInterfaces } from '../interface/for-all-interfaces';
import { getCallSignatureName } from './get-call-signature-name';

/**
 *
 * @param callSignature
 */
export function getCallSignatureChain(
  callSignature: CallSignatureDeclaration,
): CallSignatureDeclaration[] {
  const parent: Node | undefined = callSignature.getParent();
  const callSignatures: CallSignatureDeclaration[] = [];
  const name = getCallSignatureName(callSignature);

  if (Node.isInterfaceDeclaration(parent)) {
    forAllInterfaces(parent, (int: InterfaceDeclaration) => {
      const callSignature: CallSignatureDeclaration | undefined = int.getCallSignature(
        (cs) => getCallSignatureName(cs) === name,
      );

      if (callSignature) {
        callSignatures.push(callSignature);
      }
    });
  }

  return callSignatures;
}
