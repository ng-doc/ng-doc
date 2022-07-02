export interface NgDocPlaygroundProperties {
	[input: string]: NgDocPlaygroundProperty;
}

export interface NgDocPlaygroundProperty {
	type: string;
	comment?: string;
}
