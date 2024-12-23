import { CallSignatureDeclaration } from 'ts-morph';

/**
 *
 * @param callSignature
 */
export function getCallSignatureName(callSignature: CallSignatureDeclaration): string {
  return callSignature.getText().split(/(?<=\)):\s?/)[0];
}
