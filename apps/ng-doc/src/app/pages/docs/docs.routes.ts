import {Routes} from '@angular/router';
import {NG_DOC_ROUTING} from '@ng-doc/generated';

import {DocsComponent} from './docs.component';

const routes: Routes = [
	{path: '', redirectTo: 'getting-started/installation', pathMatch: 'full'},
	{path: '', component: DocsComponent, children: NG_DOC_ROUTING},
];

export default routes;
