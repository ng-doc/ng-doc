export interface NgDocPlaygroundProperties {
	[input: string]: NgDocPlaygroundProperty;
}

export interface NgDocPlaygroundProperty<T = unknown> {
	type: string;
	comment?: string;
	literals?: T[];
}
