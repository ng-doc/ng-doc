import { Node, ObjectLiteralElementLike } from 'ts-morph';

/**
 *    Get property assignment from object literal node as string
 * @param {ObjectLiteralElementLike} objectLiteralElementLike - Object literal node
 * @returns {string} Property assignment
 */
export function getPropertyAssignment(objectLiteralElementLike?: ObjectLiteralElementLike): string {
	return Node.isPropertyAssignment(objectLiteralElementLike)
		? objectLiteralElementLike?.getInitializer()?.getText() ?? ''
		: '';
}
