import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import {
  blockquoteProcessor,
  codeProcessor,
  demoPaneProcessor,
  demoProcessor,
  headingAnchorProcessor,
  iconProcessor,
  linkProcessor,
  mermaidProcessor,
  playgroundProcessor,
  tabsProcessor,
  tooltipProcessor,
} from '@ng-doc/app/processors/processors';

export const NG_DOC_DEFAULT_PAGE_PROCESSORS: NgDocPageProcessor[] = [
  /**
   * The order of the directives is important.
   * The higher the directive is in the list, the earlier it will be run.
   */
  linkProcessor,
  iconProcessor,
  headingAnchorProcessor,
  blockquoteProcessor,
  tooltipProcessor,
  mermaidProcessor,
  codeProcessor,
  demoProcessor,
  demoPaneProcessor,
  playgroundProcessor,
  tabsProcessor,
];
