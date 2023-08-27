import { createSourceFile } from 'ng-morph';

/**
 *
 */
export function createGitIgnore(): void {
	createSourceFile('.gitignore', `.cache`);
}
