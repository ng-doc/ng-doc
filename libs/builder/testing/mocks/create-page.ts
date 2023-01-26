import {camelize, classify} from '@angular-devkit/core/src/utils/strings';
import {DirectoryItems} from 'mock-fs/lib/filesystem';

import {PAGE_NAME} from '../../engine';

/**
 *
 * @param name
 */
export function createMockPage(name: string): DirectoryItems {
	return {
		[camelize(name)]: {
			'index.md': 'Mocked page content',
			[PAGE_NAME]: `
				import {NgDocPage} from '@ng-doc/core';

				export const ${classify(name)}: NgDocPage = {
					title: '${name}',
					mdFile: './index.md',
				}

				export default ${classify(name)};
			`,
		},
	};
}

/**
 *
 * @param name
 */
export function mockedPagePath(name: string): string {
	return `${camelize(name)}/${PAGE_NAME}`;
}

/**
 *
 * @param name
 */
export function mockedPageFSPath(name: string): string {
	return `${process.cwd()}/${mockedPagePath(name)}`;
}
