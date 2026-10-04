## Open in a new tab

To let readers open a demo on its own page, add a child route for it to the `route` of the page in
`ng-doc.page.ts`:

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

Then pass the path of the route as the `fullscreenRoute` option. A link that opens the route in a
new tab replaces the demo. The route is a standalone page: the demo alone on the dotted canvas,
with a small link back to the page in the corner, and without the navbar, the sidebar, the table of
contents or the page content. Your `app.html` needs no changes for it, and the server renders and
prerenders the route the same way.
