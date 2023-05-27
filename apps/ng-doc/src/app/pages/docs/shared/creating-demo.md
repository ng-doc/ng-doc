## Creating a demo

First of all, in order to display the demo on the page, you need the `NgModule`,
you can read about how to create it in the `*EntitiesPage` article.

Your demo should be declared in you module's `declarations` field, then you can
import it into the page file and add it to the `demos` field.

```typescript fileName="ng-doc.page.ts"
import {NgDocPage} from '@ng-doc/core';
import {MyModule} from '../my.module';
import {ButtonDemoComponent} from '../demos/button-demo/button-demo.component';

export const MyAwesomePage: NgDocPage = {
  module: MyModule,
  demos: {ButtonDemoComponent},
};

export default MyAwesomePage;
```
