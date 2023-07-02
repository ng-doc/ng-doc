export interface NgDocProcessorOptions<T> {
	anchor?: Element;
	content?: Node[][];
	inputs: Partial<T>;
}
