import {NgDocPlaygroundDynamicContent, NgDocPlaygroundProperties} from '@ng-doc/builder';

export interface NgDocPlaygroundFormData<
	P extends NgDocPlaygroundProperties = NgDocPlaygroundProperties,
	C extends Record<string, NgDocPlaygroundDynamicContent> = Record<string, NgDocPlaygroundDynamicContent>,
> {
	properties: Record<keyof P, unknown>;
	content: Record<keyof C, boolean>;
}
