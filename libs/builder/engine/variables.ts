import * as path from 'path';

export const GLOBALS = {
	workspaceRoot: '',
	relative: (p: string) => path.relative(GLOBALS.workspaceRoot, p),
};
export const PAGE_NAME: string = 'ng-doc.page.ts';
export const CATEGORY_NAME: string = 'ng-doc.category.ts';
export const API_NAME: string = 'ng-doc.api.ts';

export const PAGE_PATTERN: string = `**/${PAGE_NAME}`;
export const CATEGORY_PATTERN: string = `**/${CATEGORY_NAME}`;
export const API_PATTERN: string = `**/${API_NAME}`;
export const CACHE_PATH: string = path.join(__dirname, '.cache');
export const TEMPLATES_PATH: string = path.join(__dirname, '../templates');
