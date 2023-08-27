import {NgDocPageProcessor} from '@ng-doc/app/interfaces';
import {
	blockquoteProcessor,
	codeProcessor,
	demoPaneProcessor,
	demoProcessor,
	iconProcessor,
	linkProcessor,
	playgroundProcessor,
	tabsProcessor,
	tooltipProcessor,
} from '@ng-doc/app/processors/processors';

export const NG_DOC_DEFAULT_PAGE_PROCESSORS: NgDocPageProcessor[] = [
	/**
	 * The order of the directives is important.
	 * The higher the directive is in the list, the earlier it will be run.
	 */
	blockquoteProcessor,
	iconProcessor,
	tooltipProcessor,
	linkProcessor,
	codeProcessor,
	demoProcessor,
	demoPaneProcessor,
	playgroundProcessor,
	tabsProcessor,
];
