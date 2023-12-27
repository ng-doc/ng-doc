import { ObservableSet } from '../../../classes';
import { markdownToHtml } from '../../../helpers';
import { Job } from '../../core';

/**
 *
 * @param dir
 * @param dependencies
 */
export function markdownToHtmlJob(dir: string, dependencies: ObservableSet<string>): Job<string> {
	return async (data: string) => {
		return markdownToHtml(data, dir, dependencies.add.bind(dependencies));
	};
}
