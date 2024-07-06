import { parseSnippet } from '../parse-snippet';

describe('parseSnippet', () => {
	it('should parse simple snippet', () => {
		const str: string = 'snippet';

		expect(parseSnippet(str)).toEqual({
			id: null,
		});
	});

	it('should parse title', () => {
		const str: string = 'snippet "Title"';

		expect(parseSnippet(str)).toEqual({
			id: null,
			title: 'Title',
		});
	});

	it('should parse icon', () => {
		const str: string = 'snippet icon="icon"';

		expect(parseSnippet(str)).toEqual({
			id: null,
			icon: 'icon',
		});
	});

	it('should parse opened', () => {
		const str: string = 'snippet opened';

		expect(parseSnippet(str)).toEqual({
			id: null,
			opened: true,
		});
	});

	it('should parse id', () => {
		const str: string = 'snippet#id';

		expect(parseSnippet(str)).toEqual({
			id: 'id',
		});
	});

	it('should parse lang', () => {
		const str: string = 'snippet:html';

		expect(parseSnippet(str)).toEqual({
			id: null,
			lang: 'html',
		});
	});

	it('should parse id and lang', () => {
		const str: string = 'snippet#id:html';

		expect(parseSnippet(str)).toEqual({
			id: 'id',
			lang: 'html',
		});
	});

	it('should parse id, lang, title, icon', () => {
		const str: string = 'snippet#id:html "Title" icon="icon" opened';

		expect(parseSnippet(str)).toEqual({
			id: 'id',
			lang: 'html',
			title: 'Title',
			icon: 'icon',
			opened: true,
		});
	});

	it('should return undefined when string is not a snippet', () => {
		const str: string = 'not a snippet';

		expect(parseSnippet(str)).toBeUndefined();
	});
});
