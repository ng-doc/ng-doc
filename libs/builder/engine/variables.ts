import * as path from 'path';

export const PAGE_NAME: string = 'ng-doc.page.ts';
export const CATEGORY_NAME: string = 'ng-doc.category.ts';
export const RENDERED_PAGE_NAME: string = 'index.md';

export const PAGE_PATTERN: string = `**/${PAGE_NAME}`;
export const CATEGORY_PATTERN: string = `**/${CATEGORY_NAME}`;
export const CACHE_PATH: string = path.join(__dirname, '.cache');
export const GENERATED_PATH: string = path.join(__dirname, '../generated');
export const GENERATED_MODULES_PATH: string = path.join(GENERATED_PATH, 'modules');
export const TEMPLATES_PATH: string = path.join(__dirname, '../templates');
