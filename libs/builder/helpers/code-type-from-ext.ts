import {NgDocCodeType} from '@ng-doc/core';

/**
 *
 * @param filePath
 */
export function codeTypeFromExt(filePath: string): NgDocCodeType {
	const ext: string | undefined = filePath.split('.').pop();

	switch (ext) {
		case 'ts':
			return 'TypeScript';
		case 'html':
			return 'HTML';
		case 'css':
			return 'CSS';
		case 'scss':
			return 'SCSS';
		case 'less':
			return 'LESS';
		case 'sass':
			return 'SASS';
		default:
			return 'unknown';
	}
}
