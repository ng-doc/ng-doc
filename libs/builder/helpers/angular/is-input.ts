import {
  GetAccessorDeclaration,
  Node,
  PropertyDeclaration,
  SetAccessorDeclaration,
} from 'ts-morph';

export type NgDocInputDeclaration =
  | PropertyDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration;

/**
 *
 * @param p
 */
export function isInput(p: NgDocInputDeclaration): boolean {
  return isInputDecorator(p) || isInputSignal(p);
}

/**
 *
 * @param p
 */
export function isInputSignal(p: NgDocInputDeclaration): boolean {
  const typeDeclaration = p.getType().getSymbol()?.getDeclarations()[0];

  if (Node.isInterfaceDeclaration(typeDeclaration)) {
    return ['InputSignal', 'InputSignalWithTransform'].includes(typeDeclaration.getName());
  }

  return false;
}

/**
 *
 * @param p
 */
export function isInputDecorator(p: NgDocInputDeclaration): boolean {
  return !!p.getDecorator('Input');
}
