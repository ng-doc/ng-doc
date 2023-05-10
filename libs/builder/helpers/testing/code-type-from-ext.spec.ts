import {codeTypeFromExt} from '../code-type-from-ext';

describe('codeTypeFromExt', () => {
	it('should return TypeScript for ts files', () => {
		expect(codeTypeFromExt('test.ts')).toBe('TypeScript');
	});

	it('should return HTML for html files', () => {
		expect(codeTypeFromExt('test.html')).toBe('HTML');
	});

	it('should return CSS for css files', () => {
		expect(codeTypeFromExt('test.css')).toBe('CSS');
	});

	it('should return SCSS for scss files', () => {
		expect(codeTypeFromExt('test.scss')).toBe('SCSS');
	});

	it('should return LESS for less files', () => {
		expect(codeTypeFromExt('test.less')).toBe('LESS');
	});

	it('should return SASS for sass files', () => {
		expect(codeTypeFromExt('test.sass')).toBe('SASS');
	});

	it('should return unknown for unknown files', () => {
		expect(codeTypeFromExt('test.pdf')).toBe('unknown');
	});

	describe('Windows paths', () => {
		it('should return TypeScript for ts files', () => {
			expect(codeTypeFromExt('C:\\test\\test.ts')).toBe('TypeScript');
		});

		it('should return HTML for html files', () => {
			expect(codeTypeFromExt('C:\\test\\test.html')).toBe('HTML');
		});

		it('should return CSS for css files', () => {
			expect(codeTypeFromExt('C:\\test\\test.css')).toBe('CSS');
		});

		it('should return SCSS for scss files', () => {
			expect(codeTypeFromExt('C:\\test\\test.scss')).toBe('SCSS');
		});

		it('should return LESS for less files', () => {
			expect(codeTypeFromExt('C:\\test\\test.less')).toBe('LESS');
		});

		it('should return SASS for sass files', () => {
			expect(codeTypeFromExt('C:\\test\\test.sass')).toBe('SASS');
		});

		it('should return unknown for unknown files', () => {
			expect(codeTypeFromExt('C:\\test\\test.pdf')).toBe('unknown');
		});
	});
});
