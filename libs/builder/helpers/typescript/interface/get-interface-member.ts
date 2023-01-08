import {InterfaceDeclaration, Node, TypeElementTypes} from 'ts-morph';

import {NgDocInterfaceMember} from '../member/member-type';

/**
 *
 * @param int
 * @param name
 */
export function getInterfaceMember(int: InterfaceDeclaration, name: string): NgDocInterfaceMember | undefined {
	return (
		int
			.getMembers()
			.filter(
				(m: TypeElementTypes) =>
					!Node.isConstructSignatureDeclaration(m) &&
					!Node.isCallSignatureDeclaration(m) &&
					!Node.isIndexSignatureDeclaration(m),
			) as NgDocInterfaceMember[]
	).find((m: NgDocInterfaceMember) => m.getName() === name);
}
