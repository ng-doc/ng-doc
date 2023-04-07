import {NgDocAsset} from '@ng-doc/builder';
import {NgDocStyleType} from '@ng-doc/core';
import {vol} from 'memfs';

import {buildAssets} from '../build-assets';

jest.mock('fs');

describe('buildAssets', () => {

	beforeEach(() => {
		console.error = jest.fn();

		vol.reset();
	})

	it('should return an empty array if the file does not exist', () => {
		const filePath: string = '/path/to/file.html';
		const styleType: NgDocStyleType = 'CSS';
		const result: Array<Omit<NgDocAsset, 'outputPath'>> = buildAssets(filePath, styleType);

		expect(console.error).toHaveBeenCalled();
		expect(result).toEqual([]);
	})

	it('should return an array with a single asset if the file does not contain snippets', () => {
		const filePath: string = '/path/to/file.html';
		const styleType: NgDocStyleType = 'CSS';
		const fileContent: string = 'file content';
		vol.fromJSON({
			[filePath]: fileContent
		});
		const result: Array<Omit<NgDocAsset, 'outputPath'>> = buildAssets(filePath, styleType);

		expect(result).toStrictEqual([
			{
				title: 'HTML',
				name: 'Asset',
				originalPath: filePath,
				code: fileContent,
				output: fileContent,
				type: 'HTML',
			}
		]);
	})

	it('should return an array with a single asset if the file contains one snippet', () => {
		const filePath: string = '/path/to/file.html';
		const styleType: NgDocStyleType = 'CSS';
		const snippetContent: string = 'snippet content';
		const fileContent: string = `
			<!-- NgDocHTMLSnippetStart -->
			${snippetContent}
			<!-- NgDocHTMLSnippetEnd -->
		`;
		vol.fromJSON({
			[filePath]: fileContent
		});
		const result: Array<Omit<NgDocAsset, 'outputPath'>> = buildAssets(filePath, styleType);

		expect(result).toStrictEqual([
			{
				title: 'Code Snippet 1',
				name: 'Asset',
				originalPath: filePath,
				code: snippetContent,
				output: snippetContent,
				type: 'HTML',
			}
		]);
	})

	it('should return only one snippet if the file contains multiple snippets without name', () => {
		const filePath: string = '/path/to/file.html';
		const styleType: NgDocStyleType = 'CSS';
		const snippetContent1: string = 'snippet content 1';
		const snippetContent2: string = 'snippet content 2';
		const fileContent: string = `
			<!-- NgDocHTMLSnippetStart -->
			${snippetContent1}
			<!-- NgDocHTMLSnippetEnd -->
			<!-- NgDocHTMLSnippetStart -->
			${snippetContent2}
			<!-- NgDocHTMLSnippetEnd -->
		`;
		vol.fromJSON({
			[filePath]: fileContent
		});
		const result: Array<Omit<NgDocAsset, 'outputPath'>> = buildAssets(filePath, styleType);

		expect(result).toStrictEqual([
			{
				title: 'Code Snippet 1',
				name: 'Asset',
				originalPath: filePath,
				code: snippetContent1,
				output: snippetContent1,
				type: 'HTML',
			}
		]);
	})

	it('should return an array with multiple assets if the file contains multiple snippets with name', () => {
		const filePath: string = '/path/to/file.html';
		const styleType: NgDocStyleType = 'CSS';
		const snippetContent1: string = 'snippet content 1';
		const snippetContent2: string = 'snippet content 2';
		const fileContent: string = `
			<!-- NgDocHTMLSnippetStart(Snippet1) -->
			${snippetContent1}
			<!-- NgDocHTMLSnippetEnd(Snippet1) -->
			<!-- NgDocHTMLSnippetStart(Snippet2) -->
			${snippetContent2}
			<!-- NgDocHTMLSnippetEnd(Snippet2) -->
		`;
		vol.fromJSON({
			[filePath]: fileContent
		});
		const result: Array<Omit<NgDocAsset, 'outputPath'>> = buildAssets(filePath, styleType);

		expect(result).toStrictEqual([
			{
				title: 'Snippet1',
				name: 'Asset',
				originalPath: filePath,
				code: snippetContent1,
				output: snippetContent1,
				type: 'HTML',
			},
			{
				title: 'Snippet2',
				name: 'Asset',
				originalPath: filePath,
				code: snippetContent2,
				output: snippetContent2,
				type: 'HTML',
			}
		]);
	})
})
