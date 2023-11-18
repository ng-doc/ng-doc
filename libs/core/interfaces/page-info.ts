import { NgDocPageType } from '../types';

export type NgDocPageInfos = Record<string, NgDocPageInfo>;

export interface NgDocPageInfo {
	route: string;
	title: string;
	type: NgDocPageType;
	kind?: string;
}
