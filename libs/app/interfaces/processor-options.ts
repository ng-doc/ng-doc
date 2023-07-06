export interface NgDocProcessorOptions<T, K extends keyof T = keyof T> {
	anchor?: Element;
	content?: Node[][];
	inputs: Partial<Record<K, T[K]>>;
}
