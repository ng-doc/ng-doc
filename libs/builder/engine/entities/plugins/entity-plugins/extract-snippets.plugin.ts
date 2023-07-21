import {snippetsFromAsset} from '../../../../helpers';
import {NgDocAsset} from '../../../../interfaces';
import {NgDocEntityPlugin} from '../types';

/**
 *
 */
export function extractSnippetsPlugin(): NgDocEntityPlugin<NgDocAsset[]> {
	return {
		id: 'extractSnippetsPlugin',
		implementation: async (data, entity) => {
			const snippets = [];

			for (const asset of data) {
				snippets.push(...snippetsFromAsset(asset, entity.context.inlineStyleLanguage));
			}

			return data.concat(snippets);
		},
	};
}
