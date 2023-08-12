import {removeLinesFromCode} from '../remove-lines-from-code';

describe('removeLinesFromCode', () => {
	describe('TypeScript', () => {
		it('should remove one lines from the code', () => {
			const code = `
			const a = 1;
			// ng-doc-ignore-line
			const b = 2;
			`;

			expect(removeLinesFromCode(code).trim()).toEqual('const a = 1;');
		});

		it('should remove multiple lines from the code', () => {
			const code = `
			const a = 1;
			// ng-doc-ignore-line 2
			const b = 2;
			const c = 3;
			`;

			expect(removeLinesFromCode(code).trim()).toEqual('const a = 1;');
		});
	});

	describe('HTML', () => {
		it('should remove one lines from the code', () => {
			const code = `
			<div>1</div>
			<!-- ng-doc-ignore-line -->
			<div>2</div>
			`;

			expect(removeLinesFromCode(code).trim()).toEqual('<div>1</div>');
		});

		it('should remove multiple lines from the code', () => {
			const code = `
			<div>1</div>
			<!-- ng-doc-ignore-line 2 -->
			<div>2</div>
			<div>3</div>
			`;

			expect(removeLinesFromCode(code).trim()).toEqual('<div>1</div>');
		});
	});

	describe('CSS', () => {
		it('should remove one lines from the code', () => {
			const code = `
			.a {color: red;}
			/* ng-doc-ignore-line */
			.b {color: blue;}
			`;

			expect(removeLinesFromCode(code).trim()).toEqual('.a {color: red;}');
		});

		it('should remove multiple lines from the code', () => {
			const code = `
			.a {color: red;}
			/* ng-doc-ignore-line 2 */
			.b {color: blue;}
			.c {color: green;}
			`;

			expect(removeLinesFromCode(code).trim()).toEqual('.a {color: red;}');
		});
	});
});
