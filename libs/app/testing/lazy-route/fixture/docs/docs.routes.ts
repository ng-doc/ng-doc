import { Routes } from '@angular/router';

import { DocsLayout, GuidePage } from './docs';
import { provideFixtureDocs } from './providers';

/** The documentation routes, with every NgDoc provider in the route's own `providers`. */
const routes: Routes = [
  {
    path: '',
    providers: provideFixtureDocs(),
    component: DocsLayout,
    children: [
      { path: '', redirectTo: 'guide', pathMatch: 'full' },
      { path: 'guide', component: GuidePage },
    ],
  },
];

export default routes;
