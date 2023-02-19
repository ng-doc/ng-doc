import {forkJoin, from, Observable} from 'rxjs';
import {map} from 'rxjs/operators';

/**
 *
 * @param html
 */
export function formatHtml(html: string): Observable<string> {
	return from(forkJoin([import('prettier'), import('prettier/parser-html')])).pipe(
		map(([prettier, htmlParser]: [typeof import('prettier'), typeof import('prettier/parser-html')]) =>
			prettier.format(html, {
				parser: 'html',
				plugins: [htmlParser],
				printWidth: 60,
				tabWidth: 4,
			}),
		),
	);
}
