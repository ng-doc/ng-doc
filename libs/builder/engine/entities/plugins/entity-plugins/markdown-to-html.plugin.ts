import { isPageEntity, markdownToHtml } from '../../../../helpers';
import { NgDocEntityPlugin } from '../types';

/**
 *
 */
export function markdownToHtmlPlugin(): NgDocEntityPlugin<string> {
	return {
		id: 'markdownToHtmlPlugin',
		execute: async (data, entity) => {
			if (isPageEntity(entity)) {
				return markdownToHtml(
					data,
					entity.mdFolder,
					entity.dependencies.add.bind(entity.dependencies),
				);
			}

			return markdownToHtml(data);
		},
	};
}
