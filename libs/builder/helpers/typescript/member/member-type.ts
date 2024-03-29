import {
	CallSignatureDeclaration,
	ClassInstanceMemberTypes,
	ConstructSignatureDeclaration,
	IndexSignatureDeclaration,
	TypeElementTypes,
} from 'ts-morph';

export type NgDocClassMember = ClassInstanceMemberTypes;
export type NgDocInterfaceMember = Exclude<
	TypeElementTypes,
	ConstructSignatureDeclaration | CallSignatureDeclaration | IndexSignatureDeclaration
>;
export type NgDocMemberType = NgDocClassMember | NgDocInterfaceMember;
