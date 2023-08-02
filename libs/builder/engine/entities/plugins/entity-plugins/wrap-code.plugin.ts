import {renderTemplate} from '../../../nunjucks';
import {NgDocEntityPlugin} from '../types';

/**
 *
 * @param lang
 */
export function wrapCodePlugin(lang: string): NgDocEntityPlugin<string> {
	return {
		id: 'wrapCodePlugin',
		execute: async (code) => {
			return renderTemplate('./code.html.nunj', {
				context: {code, lang: lang.toLowerCase() || 'ts'},
			}).trim();
		},
	};
}
