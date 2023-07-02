export interface NgDocCodeBlockParams {
	language?: string;
	lineNumbers?: boolean;
	name?: string;
	group?: string;
	active?: boolean;
	file?: string;
	fileLineStart?: number;
	fileLineEnd?: number;
	highlightedLines?: number[];
}
