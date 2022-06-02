import {NgDocCodeType} from '../types';

/**
 *
 * @param filePath
 */
export function codeTypeFromExt(filePath: string): NgDocCodeType {
	const ext: string | undefined = filePath.split('.').pop();

	switch (ext) {
		case 'ts':
			return 'typescript';
		case 'html':
			return 'html';
		case 'css':
			return 'css';
		case 'scss':
			return 'scss';
		case 'less':
			return 'less';
		case 'sass':
			return 'sass';
		default:
			return 'unknown';
	}
}
