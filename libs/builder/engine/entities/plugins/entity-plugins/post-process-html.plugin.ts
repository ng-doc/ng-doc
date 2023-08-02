import {postProcessHtml} from '../../../../helpers';
import {NgDocEntityPlugin} from '../types';

/**
 *
 */
export function postProcessHtmlPlugin(): NgDocEntityPlugin<string> {
	return {
		id: 'postProcessHtmlPlugin',
		execute: async (data, entity) => {
			return postProcessHtml(data, entity);
		},
	};
}
