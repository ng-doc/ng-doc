export interface NgDocTypeControl {
	options?: string[];
	registerOnChange(fn: (value: string) => void): void;
	writeValue(value: string): void;
}
