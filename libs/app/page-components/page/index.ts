import { Type } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  NgDocCodeComponent, NgDocDemoComponent,
  NgDocHeadingAnchorComponent, NgDocMermaidViewerComponent,
  NgDocPageLinkComponent,
} from '@ng-doc/app/components';
import { NgDocBlockquoteComponent } from '@ng-doc/ui-kit';

export const NG_DOC_PAGE_SHARABLE_COMPONENTS: Array<Type<unknown>> = [
  NgDocHeadingAnchorComponent,
  RouterLink,
  NgDocPageLinkComponent,
  NgDocBlockquoteComponent,
  NgDocCodeComponent,
  NgDocMermaidViewerComponent,
  NgDocDemoComponent,
]
