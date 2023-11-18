## Disable fullscreen routes

To disable the fullscreen mode and manage child routes yourself, you need to specify disableFullscreenRoutes in `ng-doc.page.ts`.
You will then need a <router-outlet /> in your page (for example in the demo).

By default `disableFullscreenRoutes` is `false`.

```typescript name="ng-doc.page.ts" {10}
import { NgDocPage } from '@ng-doc/core';
import { MasterDetailComponent } from './master-detail.component';
import { MasterComponent } from './master.component';
import { DetailComponent } from './detail.component';

const MyAwesomePage: NgDocPage = {
  title: 'MyAwesomePage',
  mdFile: './index.md',
  demos: { MasterDetailComponent },
  disableFullscreenRoutes: true,
  route: {
    children: [
      {
        path: '',
        component: MasterComponent,
      },
      {
        path: ':id',
        component: DetailComponent,
      },
    ],
  },
};

export default MyAwesomePage;
```
