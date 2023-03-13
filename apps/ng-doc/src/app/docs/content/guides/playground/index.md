# {{ NgDocPage.title }}

The Playground is another cool feature that NgDoc provides out of the box, it's especially handy for
creating dynamic demos of your components and directives, to give your users the opportunity to play
with them.

## Creating a playground

To create a playground, you need to create a `ng-doc.dependencies.ts` file and `NgModule` in your
page folder, you can read more about how to do this in the `*EntitiesDependencies` article.

## Configuration

In the `ng-doc.dependencies.ts` file, add the `playgrounds` field, which must match the
`NgDocPlaygroundConfig` interface. A playground config is a regular object whose key is the name of
the playground (which you should use to display it on the page) and whose value is the config
itself,
for example:

> **Note**
> For the template you can also use your real selector, but we recommend using `ng-doc-selector` to
> avoid cases where your playgrounds stop working when the selector is changed during refactoring.

> **Note**
> If you don't need to render all possible selectors of your component, you can use the `selector`
> field
> to specify the selectors that you want to see in your playground.

```typescript
import {NgDocDependencies} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

import {PageModule} from './ng-doc.module';

const PageDependencies: NgDocDependencies = {
	module: PageModule,
	playgrounds: {
		TagPlayground: {
			target: NgDocTagComponent,
			template: `<ng-doc-selector>Tag Label</ng-doc-selector>`,
		},
	},
};

export default PageDependencies;
```

-   `target` - The Angular Component/Directive class that will be used for the playground (make sure
    you export the module of this
    component from the **module of your page** (`PageModule` in the current example), otherwise
    Angular will not be able to create it)
-   `template` - The template that will be used for the playground, you can use the Angular syntax
    inside,
    but it's value cannot be provided dynamically, so you can't use variables or functions there,
    value of this property should be static.
-   `<ng-doc-selector>` - is a unique tag that will be dynamically replaced with your component's
    selector, and if your component has multiple selectors, NgDoc will also create a view for each
    possible selector.

In this example, we created a playground for the `NgDocTagComponent`, to make it work,
we also need to export its module from the `PageModule`.

> **Note**
> If you are using any other components in your playground, you must also export their modules from
> your page module.

```typescript
import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocTagModule} from '@ng-doc/ui-kit';

@NgModule({
	imports: [CommonModule],
	// Just export all modules that are needed for your playgrounds
	exports: [NgDocTagModule],
})
export class PageModule {}
```

## Displaying

To display the created playground on the page, you should use the `playground` method
from `NgDocActions`, passing the key of your playground to it as follows

```twig
{{'{{ NgDocActions.playground("TagPlayground") }}' | safe }}
```

## Playground example

NgDoc will recognize `@Input` field types and creates controls for them, which allow you to change their
values and see how the component changes.

{{ NgDocActions.playground("TagPlayground") }}

## Input types recognition

There is no magic, NgDoc can only recognize simple type such as `string`, `number`, `boolean`,
or Type Alias types which are union of `string`, `number`, `boolean`.

It can't recognize complex types such as `Interface`, `Class` or `Enum`, but you can create your
own custom controls for them to teach NgDoc doing that, read more about it in
the `*CustomizationTypeControls`.

## Optional content

Some components may support displaying other child components with `ng-content`, and they may be
optional, or you just want to make some content in the playground optional, to do this you can use
the `content` field in your playground configuration, for example:

```typescript
import {NgDocDependencies} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

import {PageModule} from './ng-doc.module';

const PageDependencies: NgDocDependencies = {
	module: PageModule,
	playgrounds: {
		TagIconPlayground: {
			target: NgDocTagComponent,
			template: `
			<ng-doc-selector>
				{{ "{{content.icon}}" | safe }}
				Tag Label
			</ng-doc-selector>`,
			content: {
				icon: {
					label: 'email icon',
					template: '<ng-doc-icon icon="at-sign" [size]="16"></ng-doc-icon>',
				},
			},
		},
	},
};

export default PageDependencies;
```

### Example of output

NgDoc will create new control in the `Content` section that allows you to display or hide dynamic
content.

{{ NgDocActions.playground("TagIconPlayground") }}

## Custom data and variables

To make your playgrounds more lively and dynamic you can use `data` field,
and put any data you want in it, to use it in your template, for example like that:

```typescript
import {NgDocDependencies} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

import {PageModule} from './ng-doc.module';

const PageDependencies: NgDocDependencies = {
	module: PageModule,
	playgrounds: {
		TagDataPlayground: {
			target: NgDocTagComponent,
			template: `<ng-doc-selector>{{ "{{data.array | json}}" | safe }}</ng-doc-selector>`,
			data: {
				array: [1, 2, 3],
			},
		},
	},
};

export default PageDependencies;
```

### Example of output

{{ NgDocActions.playground("TagDataPlayground") }}

## See Also

-   `*EntitiesPage`
-   `*EntitiesDependencies`
-   `*CustomizationTypeControls`
