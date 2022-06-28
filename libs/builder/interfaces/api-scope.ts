export interface NgDocApiScope {
	name: string;
	route: string;
	order?: number;
	include: string | string[];
	exclude?: string | string[];
}
