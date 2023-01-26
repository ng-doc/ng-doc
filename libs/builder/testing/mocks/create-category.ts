import {camelize, classify} from '@angular-devkit/core/src/utils/strings';
import {DirectoryItems} from 'mock-fs/lib/filesystem';

import {CATEGORY_NAME} from '../../engine';

/**
 *
 * @param name
 */
export function createMockCategory(name: string): DirectoryItems {
	return {
		[camelize(name)]: {
			[CATEGORY_NAME]: `
				import {NgDocCategory} from '@ng-doc/core';

				const ${classify(name)}: NgDocCategory = {
					title: '${name}',
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
export function mockedCategoryPath(name: string): string {
	return `${camelize(name)}/${CATEGORY_NAME}`;
}

/**
 *
 * @param name
 */
export function mockedCategoryFSPath(name: string): string {
	return `${process.cwd()}/${mockedCategoryPath(name)}`;
}
