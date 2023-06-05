import {NgDocPlaygroundProperties} from '@ng-doc/core';
import {ClassDeclaration} from 'ts-morph';

export interface NgDocPlaygroundMetadata {
	selector?: string;
	name?: string;
	standalone: boolean;
	template: string;
	templateForComponents: Record<string, string>;
	class: ClassDeclaration;
	properties: NgDocPlaygroundProperties;
	content: Record<string, string>;
}
