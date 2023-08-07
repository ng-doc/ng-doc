export interface NgDocDemoAssets {
	[name: string]: NgDocDemoAsset[];
}

export interface NgDocDemoAsset {
	code: string;
	title: string;
	icon?: string;
	opened?: boolean;
}
