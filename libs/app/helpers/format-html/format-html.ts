import {from, Observable} from 'rxjs';
import {map} from 'rxjs/operators';

/**
 *
 * @param html
 */
export function formatHtml(html: string): Observable<string> {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	return from(import('js-beautify/js/lib/beautify-html.js')).pipe(
		map((formatter: any) => formatter.html_beautify(html.trim())),
	);
}
