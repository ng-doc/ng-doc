import {processSnippets} from '../process-snippets';

describe('processSnippets', () => {
	describe('JS and CSS snippets', () => {
		describe('inline comment', () => {
			it('should extract snippet', () => {
				const code = `
			function test() {
				// snippet
				console.log('test');
				// snippet
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test');`,
						lang: 'ts',
					},
				]);
			});

			it('should extract multiple snippets', () => {
				const code = `
			function test() {
				// snippet
				console.log('test1');
				// snippet
				// snippet
				console.log('test2');
				// snippet
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');`,
						lang: 'ts',
					},
					{
						code: `console.log('test2');`,
						lang: 'ts',
					},
				]);
			});

			it('should extract nested snippets with id', () => {
				const code = `
			function test() {
				// snippet#1
				console.log('test1');
				// snippet#2
				console.log('test2');
				// snippet#2
				// snippet#1
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');
console.log('test2');`,
						lang: 'ts',
					},
					{
						code: `console.log('test2');`,
						lang: 'ts',
					},
				]);
			});

			it('should extract lang from snippet', () => {
				const code = `
			function test() {
				// snippet:js
				console.log('test1');
				// snippet
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');`,
						lang: 'js',
					},
				]);
			});

			it('should extract title from snippet', () => {
				const code = `
			function test() {
				// snippet "Title"
				console.log('test1');
				// snippet
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');`,
						lang: 'ts',
						title: 'Title',
					},
				]);
			});

			it('shloud extract opened from snippet', () => {
				const code = `
			function test() {
				// snippet opened
				console.log('test1');
				// snippet
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');`,
						lang: 'ts',
						opened: true,
					},
				]);
			});

			it('should extract title and lang from snippet', () => {
				const code = `
			function test() {
				// snippet:js "Title"
				console.log('test1');
				// snippet
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');`,
						lang: 'js',
						title: 'Title',
					},
				]);
			});

			it('should extract icon from snippet', () => {
				const code = `
			function test() {
				// snippet icon="angular"
				console.log('test1');
				// snippet
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');`,
						lang: 'ts',
						icon: 'angular',
					},
				]);
			});
		});

		describe('block comment', () => {
			it('should extract snippet', () => {
				const code = `
			function test() {
				/* snippet */
				console.log('test');
				/* snippet */
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test');`,
						lang: 'ts',
					},
				]);
			});

			it('should extract multiple snippets', () => {
				const code = `
			function test() {
				/* snippet */
				console.log('test1');
				/* snippet */
				/* snippet */
				console.log('test2');
				/* snippet */
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');`,
						lang: 'ts',
					},
					{
						code: `console.log('test2');`,
						lang: 'ts',
					},
				]);
			});

			it('should extract nested snippets with id', () => {
				const code = `
			function test() {
				/* snippet#1 */
				console.log('test1');
				/* snippet#2 */
				console.log('test2');
				/* snippet#2 */
				/* snippet#1 */
			}
		`;

				expect(processSnippets(code)).toEqual([
					{
						code: `console.log('test1');\nconsole.log('test2');`,
						lang: 'ts',
					},
					{
						code: `console.log('test2');`,
						lang: 'ts',
					},
				]);
			});
		});
	});

	describe('HTML snippets', () => {
		it('should extract snippet', () => {
			const code = `
			<div>
				<!-- snippet -->
				<p>test</p>
				<!-- snippet -->
			</div>
		`;

			expect(processSnippets(code)).toEqual([
				{
					code: `<p>test</p>`,
					lang: 'html',
				},
			]);
		});

		it('should extract multiple snippets', () => {
			const code = `
			<div>
				<!-- snippet -->
				<p>test1</p>
				<!-- snippet -->
				<!-- snippet -->
				<p>test2</p>
				<!-- snippet -->
			</div>
		`;

			expect(processSnippets(code)).toEqual([
				{
					code: `<p>test1</p>`,
					lang: 'html',
				},
				{
					code: `<p>test2</p>`,
					lang: 'html',
				},
			]);
		});

		it('should extract nested snippets with id', () => {
			const code = `
			<div>
				<!-- snippet#1 -->
				<p>test1</p>
				<!-- snippet#2 -->
				<p>test2</p>
				<!-- snippet#2 -->
				<!-- snippet#1 -->
			</div>
		`;

			expect(processSnippets(code)).toEqual([
				{
					code: `<p>test1</p>\n<p>test2</p>`,
					lang: 'html',
				},
				{
					code: `<p>test2</p>`,
					lang: 'html',
				},
			]);
		});

		it('should extract title from snippet', () => {
			const code = `
			<div>
				<!-- snippet "Title" -->
				<p>test1</p>
				<!-- snippet -->
			</div>
		`;

			expect(processSnippets(code)).toEqual([
				{
					code: `<p>test1</p>`,
					lang: 'html',
					title: 'Title',
				},
			]);
		});

		it('should extract title and lang from snippet', () => {
			const code = `
			<div>
				<!-- snippet:xml "Title" -->
				<p>test1</p>
				<!-- snippet -->
			</div>
		`;

			expect(processSnippets(code)).toEqual([
				{
					code: `<p>test1</p>`,
					lang: 'xml',
					title: 'Title',
				},
			]);
		});

		it('should extract icon from snippet', () => {
			const code = `
			<div>
				<!-- snippet icon="angular" -->
				<p>test1</p>
				<!-- snippet -->
			</div>
		`;

			expect(processSnippets(code)).toEqual([
				{
					code: `<p>test1</p>`,
					lang: 'html',
					icon: 'angular',
				},
			]);
		});

		it('should extract title, lang and icon from snippet', () => {
			const code = `
			<div>
				<!-- snippet:xml "Title" icon="angular" -->
				<p>test1</p>
				<!-- snippet -->
			</div>
		`;

			expect(processSnippets(code)).toEqual([
				{
					code: `<p>test1</p>`,
					lang: 'xml',
					title: 'Title',
					icon: 'angular',
				},
			]);
		});
	});
});
