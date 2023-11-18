import { DocBlockTag, DocExcerpt, DocNode, ExcerptKind } from '@microsoft/tsdoc';

const hiddenExcerptKinds: ExcerptKind[] = [ExcerptKind.BlockTag];

export class TsDocFormatter {
	static renderDocNode(docNode: DocNode): string {
		let result: string = '';

		if (docNode) {
			DocBlockTag;
			if (docNode instanceof DocExcerpt && !hiddenExcerptKinds.includes(docNode.excerptKind)) {
				result += docNode.content.toString();
			}
			for (const childNode of docNode.getChildNodes()) {
				result += TsDocFormatter.renderDocNode(childNode);
			}
		}

		return result;
	}

	static renderDocNodes(docNodes: readonly DocNode[]): string {
		let result: string = '';

		for (const docNode of docNodes) {
			result += TsDocFormatter.renderDocNode(docNode);
		}

		return result;
	}
}
