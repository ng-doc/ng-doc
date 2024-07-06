import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import {
  demoPaneProcessor,
  imageProcessor,
  playgroundProcessor,
  tabsProcessor,
} from '@ng-doc/app/processors/processors';

export const NG_DOC_DEFAULT_PAGE_PROCESSORS: NgDocPageProcessor[] = [
  /**
   * The order of the directives is important.
   * The higher the directive is in the list, the earlier it will be run.
   */
  demoPaneProcessor,
  playgroundProcessor,
  tabsProcessor,
  imageProcessor,
];
