import {GetAccessorDeclaration, SetAccessorDeclaration} from 'ts-morph';

export interface NgDocAccessor {
	get?: GetAccessorDeclaration;
	set?: SetAccessorDeclaration;
}
