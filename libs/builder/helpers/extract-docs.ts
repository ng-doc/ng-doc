import {
	DocBlock,
	DocParamBlock,
	TSDocConfiguration,
	TSDocParser,
	TSDocTagDefinition,
	TSDocTagSyntaxKind,
} from '@microsoft/tsdoc';
import {ParserContext} from '@microsoft/tsdoc/lib/parser/ParserContext';
import {asArray} from '@ng-doc/core';
import {JSDoc, JSDocableNode} from 'ts-morph';

import {TsDocFormatter} from '../engine/ts-doc-formatter';
import {markdownToHtml} from './markdown-to-html';

/**
 *
 * @param node
 * @param section
 * @param customTag
 * @param param
 */
export function extractDocs(node: JSDocableNode, customTag?: string): string {
	const jsDocs: JSDoc[] = asArray(node.getJsDocs()[0]);
	const parser: TSDocParser = new TSDocParser(getTsDocConfiguration());
	const docs: string = jsDocs
		.map((doc: JSDoc) => {
			const context: ParserContext = parser.parseString(doc.getText());

			return customTag
				? TsDocFormatter.renderDocNodes(
						context.docComment.customBlocks.filter(
							(block: DocBlock) => block.blockTag.tagName === customTag,
						),
				  )
				: TsDocFormatter.renderDocNode(context.docComment.summarySection);
		})
		.join('');

	return markdownToHtml(docs).trim();
}

/**
 *
 * @param node
 */
export function extractSeeDocs(node: JSDocableNode): string[] {
	const jsDocs: JSDoc[] = asArray(node.getJsDocs()[0]);
	const parser: TSDocParser = new TSDocParser(getTsDocConfiguration());

	return jsDocs
		.map((jsDoc: JSDoc) => {
			const context: ParserContext = parser.parseString(jsDoc.getText());

			return context.docComment.seeBlocks
				.map((seeBlock: DocBlock) => TsDocFormatter.renderDocNode(seeBlock))
				.map((block: string) => markdownToHtml(block));
		})
		.flat();
}

/**
 *
 * @param node
 * @param paramName
 */
export function extractParameterDocs(node: JSDocableNode, paramName: string): string {
	const jsDocs: JSDoc[] = asArray(node.getJsDocs()[0]);
	const parser: TSDocParser = new TSDocParser(getTsDocConfiguration());
	const docs: string = jsDocs
		.map((doc: JSDoc) => {
			const context: ParserContext = parser.parseString(doc.getText());
			const paramBlock: DocParamBlock | undefined =
				context.docComment.params.tryGetBlockByName(paramName);

			return paramBlock ? TsDocFormatter.renderDocNode(paramBlock.content) : '';
		})
		.join('');

	return markdownToHtml(docs).trim();
}

/**
 *
 */
function getTsDocConfiguration(): TSDocConfiguration {
	const customTags: TSDocTagDefinition[] = [
		new TSDocTagDefinition({
			tagName: '@usageNotes',
			syntaxKind: TSDocTagSyntaxKind.BlockTag,
			allowMultiple: false,
		}),
	];

	const configuration: TSDocConfiguration = new TSDocConfiguration();

	customTags.forEach((tag: TSDocTagDefinition) => configuration.addTagDefinition(tag));

	return configuration;
}
