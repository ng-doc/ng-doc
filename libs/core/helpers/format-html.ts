import {from, Observable} from 'rxjs';
import {map} from 'rxjs/operators';

type BeautifyHtml = (html: string) => string;

/**
 *
 * @param html
 */
export function formatHtml(html: string): Observable<string> {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	return from(import('js-beautify/js/lib/beautify-html.js')).pipe(
		/* This hack is needed to make it work with different bundlers. */
		map((formatter: any) => formatter?.html_beautify ?? formatter?.default?.html_beautify),
		map((beautifyHtml: BeautifyHtml) => beautifyHtml(html.trim())),
	);
}
