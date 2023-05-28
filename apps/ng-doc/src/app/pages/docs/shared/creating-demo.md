## Creating a demo

Demo is an Angular component that is used to demonstrate the usage of the
component or directive or whatever you want to show.

### Standalone Components

If you prefer standalone components then you don't need to do anything special,
just create a component and register it in the `demos` field of the page.

```typescript fileName="ng-doc.page.ts"
import {NgDocPage} from '@ng-doc/core';
import {MyModule} from '../my.module';
import {ButtonDemoComponent} from '../demos/button-demo/button-demo.component';

export const MyAwesomePage: NgDocPage = {
  demos: {ButtonDemoComponent},
};

export default MyAwesomePage;
```

### Non-Standalone Components

If you want to use a component that is not standalone, then you need to create
a module that will declare this component and import it into the page module
and register it in the `demos` field of the page.

```typescript fileName="ng-doc.page.ts"
import {NgDocPage} from '@ng-doc/core';
import {ButtonDemoModule} from '../demos/button-demo/button-demo.module';
import {ButtonDemoComponent} from '../demos/button-demo/button-demo.component';

export const MyAwesomePage: NgDocPage = {
  imports: [ButtonDemoModule],
  demos: {ButtonDemoComponent},
};

export default MyAwesomePage;
```
