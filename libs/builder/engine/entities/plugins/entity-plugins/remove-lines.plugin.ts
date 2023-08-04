import {removeLinesFromCode, snippetsFromAsset} from '../../../../helpers';
import {NgDocAsset} from '../../../../interfaces';
import {NgDocEntityPlugin} from '../types';

/**
 *
 */
export function removeLinesPlugin(): NgDocEntityPlugin<NgDocAsset[]> {
	return {
		id: 'extractSnippetsPlugin',
		execute: async (data, entity) => {
			return data
				.map((asset) => {
					const snippets = snippetsFromAsset(asset, entity.context.inlineStyleLanguage);

					return (snippets.length ? snippets : [asset]).map((asset) => ({
						...asset,
						code: removeLinesFromCode(asset.code),
					}));
				})
				.flat();
		},
	};
}
