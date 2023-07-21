import {processHtml} from '../../../../helpers';
import {NgDocEntityPlugin} from '../types';

/**
 *
 */
export function processHtmlPlugin(): NgDocEntityPlugin<string> {
	return {
		id: 'processHtmlPlugin',
		implementation: async (data, entity) => {
			return processHtml(data, entity);
		},
	};
}
