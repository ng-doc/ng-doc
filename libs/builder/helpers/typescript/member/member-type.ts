import {
	CallSignatureDeclaration,
	ClassMemberTypes,
	ClassStaticBlockDeclaration,
	ConstructorDeclaration,
	ConstructSignatureDeclaration,
	IndexSignatureDeclaration,
	TypeElementTypes,
} from 'ts-morph';

export type NgDocClassMember = Exclude<
	ClassMemberTypes,
	ConstructorDeclaration | CallSignatureDeclaration | ClassStaticBlockDeclaration
>;
export type NgDocInterfaceMember = Exclude<
	TypeElementTypes,
	ConstructSignatureDeclaration | CallSignatureDeclaration | IndexSignatureDeclaration
>;
export type NgDocMemberType = NgDocClassMember | NgDocInterfaceMember;
