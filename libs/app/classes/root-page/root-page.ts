import { NgDocDemoAssets } from '@ng-doc/app/interfaces';
import type { NgDocContentSource, NgDocPage } from '@ng-doc/core/interfaces';
import { NgDocPageType } from '@ng-doc/core/types';

/**
 * Base class for NgDoc page
 */
export abstract class NgDocRootPage {
  /**
   * The type of the page
   */
  abstract readonly pageType: NgDocPageType;
  /**
   * Html content of the page
   */
  abstract readonly pageContent: string;

  /**
   * Deferred content for generated pages. Legacy pages can continue to provide
   * {@link pageContent} only.
   */
  readonly pageContentSource?: NgDocContentSource;

  /**
   * Edit URL that can be used to edit the page source file in the repository
   */
  abstract readonly editSourceFileUrl?: string;

  /**
   * View URL that can be used to view the page source file in the repository
   */
  abstract readonly viewSourceFileUrl?: string;

  /**
   * The page dependencies file
   */
  readonly page?: NgDocPage;

  /**
   * The page demo assets that have code examples of the demo components
   */
  readonly demoAssets?: NgDocDemoAssets;
}
