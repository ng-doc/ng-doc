import {isPresent} from '@ng-doc/core';
import {ClassDeclaration, ExpressionWithTypeArguments, Node} from 'ts-morph';

import {findMember} from './find-member';
import {getMemberParent} from './get-member-parent';
import {NgDocClassMember, NgDocInterfaceMember, NgDocMemberType} from './member-type';

/**
 *	Returns member that was implemented by the provided one
 *
 * @param member - Target member
 */
export function getImplementedMember(member: NgDocMemberType): NgDocMemberType | undefined {
	const parent: Node | undefined = getMemberParent(member);
	const name: string = member.getName();

	if (Node.isClassDeclaration(parent)) {
		const baseClass: ClassDeclaration | undefined = parent.getBaseClass();

		if (baseClass) {
			const member: NgDocClassMember | undefined = findMember(baseClass, name);

			if (Node.isAbstractable(member) && member.isAbstract()) {
				return member;
			}
		}

		const nodes: Node[] = parent
			.getImplements()
			.map((expr: ExpressionWithTypeArguments) => expr.getType().getSymbol()?.getDeclarations()[0])
			.filter(isPresent)
			// Reverse implements because the latest one overrides previous one
			.reverse();

		for (const node of nodes) {
			if (Node.isClassDeclaration(node)) {
				const member: NgDocClassMember | undefined = findMember(node, name);

				if (Node.isAbstractable(member) && member.isAbstract()) {
					return member;
				}
			}

			if (Node.isInterfaceDeclaration(node)) {
				const member: NgDocInterfaceMember | undefined = findMember(node, name);

				if (member) {
					return member;
				}
			}
		}
	}

	return undefined;
}
