import {Provider} from '@angular/core';
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
import {providePageProcessor} from '@ng-doc/app/tokens';

export const NG_DOC_DEFAULT_PAGE_PROCESSORS: Provider[] = [
	/**
	 * The order of the directives is important.
	 * The higher the directive is in the list, the earlier it will be run.
	 */
	providePageProcessor(blockquoteProcessor, true),
	providePageProcessor(iconProcessor, true),
	providePageProcessor(tooltipProcessor, true),
	providePageProcessor(linkProcessor, true),
	providePageProcessor(codeProcessor, true),
	providePageProcessor(demoProcessor, true),
	providePageProcessor(demoPaneProcessor, true),
	providePageProcessor(playgroundProcessor, true),
	providePageProcessor(tabsProcessor, true),
];
