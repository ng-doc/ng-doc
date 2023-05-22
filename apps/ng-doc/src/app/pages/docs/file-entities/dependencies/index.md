# {{ NgDocPage.title }}

The dependency file is an optional entity, you may only need it if you are going to create a demo
or playground, this entity is needed to help NgDoc determine the Angular dependencies of your page
in order to generate it correctly.

## Creating a dependencies

All dependencies files should have the file name `ng-doc.dependencies.ts`.

> **Warning**
> The dependency file must be in the same directory as your `ng-doc.page.ts` file otherwise NgDoc
> will ignore it

In order to create a page you can use special schematic. You can find all available options in
the interface `NgDocBuildDependenciesSchema`.
The command will generate the `ng-doc.dependencies.ts` file as well as the `NgModule` if you specify
the `-m` argument.

```bash
ng g @ng-doc/builder:dependencies
```

## Module

The module that you need to pass in the `module` field should be Angular `NgModule`, you can create
it yourself next to the dependency file or when generating it.

What `NgModule` should include:

- `imports` - should contain all the dependencies that you need for your demos and playgrounds
- `declarations` - a list of demos that you have created specifically for this page
- `exports` - a list of modules that are needed for the playgrounds

## Configuration

{% include "../../shared/export-by-default.md" %}

The `ng-doc.dependencies.ts` file should contain your dependencies configuration,
the dependencies configuration must correspond to the `NgDocDependencies` type, you can read more
about the various
properties in the documentation for the type, below is an example of possible configuration.

```typescript fileName="ng-doc.dependencies.ts"
import {NgDocDependencies} from '@ng-doc/core';
import {ComponentClass} from '../../../libs/my-lib/src/lib/my-lib.component';
import {InlineDemoComponent} from './demos/inline-demo.component';
import {DemoWithFilesComponent} from './demos/demo-with-files.component';

const MyPageDependencies: NgDocDependencies = {
  /** NgModule that declarates demo components, and exports components that are using in the playgrounds */
  module: PageModule,
  /** Demo components, that you are going to use on the page, the object key should be Class name, and value Class constructor  */
  demo: {InlineDemoComponent, DemoWithFilesComponent},
  /** Playground components, that you are going to use on the page  */
  playgrounds: {
    MyPlayground: {
      target: ComponentClass,
      template: `<ng-doc-selector></ng-doc-selector>`,
    },
  },
};

export default MyPageDependencies;
```

{% index false %}

## See also

- `*EntitiesPage`
- `*GuidesDemo`
- `*GuidesPlayground`

{% endindex %}
