import { Type } from 'ts-morph';

import { isInputSignal, NgDocInputDeclaration } from './is-input';

/**
 *
 * @param p
 */
export function getInputType(p: NgDocInputDeclaration): Type {
	return isInputSignal(p) ? p.getType().getTypeArguments()[0] : p.getType();
}
