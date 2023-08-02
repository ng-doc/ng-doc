import {snippetsFromAsset} from '../../../../helpers';
import {NgDocAsset} from '../../../../interfaces';
import {NgDocEntityPlugin} from '../types';

/**
 *
 */
export function extractSnippetsPlugin(): NgDocEntityPlugin<NgDocAsset[]> {
	return {
		id: 'extractSnippetsPlugin',
		execute: async (data, entity) => {
			return data
				.map((asset) => {
					const snippets = snippetsFromAsset(asset, entity.context.inlineStyleLanguage);

					return snippets.length ? snippets : [asset];
				})
				.flat();
		},
	};
}
