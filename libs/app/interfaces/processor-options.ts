export interface NgDocProcessorOptions<T, K extends keyof T = keyof T> {
	content?: Node[][];
	inputs?: Partial<Record<K, T[K]>>;
}
