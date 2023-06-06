export interface NgDocEntityAnchor {
	anchor: string;
	title: string;
	type: NgDocEntityAnchorType;
}

export type NgDocEntityAnchorType = 'heading' | 'member';
