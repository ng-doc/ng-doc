import {
	NgDocBreadcrumbComponent,
	NgDocPageNavigationComponent,
	NgDocTocComponent
} from '@ng-doc/app/components';
import {NgDocPageSkeleton} from '@ng-doc/app/interfaces';


export const NG_DOC_DEFAULT_PAGE_SKELETON: NgDocPageSkeleton = {
	breadcrumbs: NgDocBreadcrumbComponent,
	navigation: NgDocPageNavigationComponent,
	toc: NgDocTocComponent,
}
