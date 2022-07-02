export class NgDocFocusUtils {
	static isNativeKeyboardFocusable(element: Element): boolean {
		if (element.hasAttribute('disabled') || element.getAttribute('tabIndex') === '-1') {
			return false;
		}

		if ((element instanceof HTMLElement && element.isContentEditable) || element.getAttribute('tabIndex') === '0') {
			return true;
		}

		switch (element.tagName) {
			case 'BUTTON':
			case 'SELECT':
			case 'TEXTAREA':
				return true;
			case 'VIDEO':
			case 'AUDIO':
				return element.hasAttribute('controls');
			case 'INPUT':
				return element.getAttribute('type') !== 'hidden';
			case 'A':
			case 'LINK':
				return element.hasAttribute('href');
			default:
				return false;
		}
	}

	static getClosestKeyboardFocusable(initial: HTMLElement, root: Node, forward: boolean = true): HTMLElement | null {
		if (!root.ownerDocument) {
			return null;
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const svgNodeFilter: NodeFilter = ((node: Node) =>
			'ownerSVGElement' in node ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) as never;

		const treeWalker: TreeWalker = root.ownerDocument.createTreeWalker(
			root,
			NodeFilter.SHOW_ELEMENT,
			svgNodeFilter,
		);

		treeWalker.currentNode = initial;

		while (forward ? treeWalker.nextNode() : treeWalker.previousNode()) {
			if (treeWalker.currentNode instanceof HTMLElement) {
				initial = treeWalker.currentNode;
			}

			if (NgDocFocusUtils.isNativeKeyboardFocusable(initial)) {
				return initial;
			}
		}

		return null;
	}

	static focusClosestElement(initial: HTMLElement, root: Node, forward: boolean = true): void {
		const focusable: HTMLElement | null = NgDocFocusUtils.getClosestKeyboardFocusable(initial, root, forward);
		if (focusable) {
			focusable.focus();
		}
	}
}
