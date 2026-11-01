import { Routes } from '@angular/router';

import { HomePage } from './home';

/**
 * The routes of an application that shows its documentation under `/docs`. Only the lazy route
 * reaches NgDoc: the home page and the root providers import nothing from it.
 */
export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'docs', loadChildren: () => import('./docs/docs.routes') },
];
