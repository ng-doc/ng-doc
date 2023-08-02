import {processHtml} from '../../../../helpers';
import {NgDocEntityPlugin} from '../types';

/**
 *
 */
export function processHtmlPlugin(): NgDocEntityPlugin<string> {
	return {
		id: 'processHtmlPlugin',
		execute: async (data, entity) => {
			return processHtml(data, entity);
		},
	};
}
