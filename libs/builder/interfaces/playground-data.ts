export type NgDocPlaygroundProperties = Record<string, NgDocPlaygroundProperty>

export interface NgDocPlaygroundProperty {
	type: string;
	description?: string;
	default?: string;
	options?: string[];
}
