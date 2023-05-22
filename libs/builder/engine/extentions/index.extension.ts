import nunjucks, {Extension} from 'nunjucks';

export class NgDocIndexExtension implements Extension {
	tags: string[] = ['index'];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	parse(parser: any, nodes: any): any {
		const token = parser.nextToken();
		const args = parser.parseSignature(null, true);
		parser.advanceAfterBlockEnd(token.value);

		const body = parser.parseUntilBlocks('endindex');

		parser.advanceAfterBlockEnd();

		return new nodes.CallExtension(this, 'run', args, [body]);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	run(context: any, index: boolean, body: any): any {
		return new nunjucks.runtime.SafeString(`<div indexable="${index}">${body()}</div>`);
	}
}
