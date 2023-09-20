## Fullscreen mode

To open a demo in fullscreen mode, you need to specify route in `ng-doc.page.ts`

```typescript name="ng-doc.page.ts" {8-13}
import { NgDocPage } from '@ng-doc/core';
import { ButtonDemoComponent } from './button-demo.component';

const MyAwesomePage: NgDocPage = {
  title: 'MyAwesomePage',
  mdFile: './index.md',
  demos: { ButtonDemoComponent },
  route: {
    children: [
      {
        path: 'button',
        component: ButtonDemoComponent,
      },
    ],
  },
};

export default MyAwesomePage;
```

After that, you can provide `fullscreenRoute` parameter to method that renders demo.
