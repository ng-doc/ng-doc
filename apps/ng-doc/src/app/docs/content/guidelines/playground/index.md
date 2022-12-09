# {{ NgDocPage.title }}

> **Warning**
> Playgrounds use the deprecated JIT compiler, so make sure you set `aot: false` in your project
> settings in `angular.json`. We'll fix that in the future releases.

The Playground is another cool feature that NgDoc provides out of the box, it's especially handy for
creating dynamic demos of your components and directives, to give your users the opportunity to play
with them.

## Creating a playground

{% include "../../../shared/export-by-default.md" %}

Creating playgrounds starts with the fact that you need to create a file `ng-doc.playground.ts` in
the folder with your page `ng-doc.page.ts`. In it you must describe the playground configuration
which must match the `NgDocPlayground` type and export it.

You will also need to create a dependency file and `NgModule`, see the `*EntitiesDependencies`
article on how to do this.

## Configuration

A playground config is a regular object whose key is the name of the playground (which you should
use to display it on the page) and whose value is the config itself, for example.

> **Note**
> For the template you can also use your real selector, but we recommend using `ng-doc-selector` to
> avoid cases where your playgrounds stop working when the selector is changed during refactoring.

> **Note**
> `ng-doc-selector` is a unique selector that will be dynamically replaced with your component's
> selector, and if your component has multiple selectors, NgDoc will also create a view for each
> possible selector.

```typescript
import {NgDocPlayground} from '@ng-doc/builder';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

const PagePlayground: NgDocPlayground = {
	TagPlayground: {
		target: NgDocTagComponent,
		template: `<ng-doc-selector>Tag Label</ng-doc-selector>`,
	},
};

export default PagePlayground;
```

In the `target` field, we passed the Angular Component, make sure you export the module of this
component from the **module of your page**, otherwise Angular will not be able to create it.

### Displaying

To display the created playground on the page, you must use the `playground` method
from `NgDocActions`,
passing the key of your playground to it as follows

```twig
{{'{{ NgDocActions.playground("TagPlayground") }}' | safe }}
```

#### Output

NgDoc will detect your component inputs types and create controls for them so you can interact with
it in real time, also when changing inputs values, NgDoc will generate a new template that your
users can copy and paste into their application

{{ NgDocActions.playground("TagPlayground") }}

### NgContent

Some components may support displaying other child components with `ng-content`, and they may be
optional, in such cases you can use the special `dynamicContent` field, which allows you to create
optional
content that can be included in the list of controls in your playground, for example

```typescript
import {NgDocPlayground} from '@ng-doc/builder';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

const PagePlayground: NgDocPlayground = {
	TagPlayground: {
		target: NgDocTagComponent,
		template: `
			<ng-doc-selector>
				{{ "{{iconContent}}" | safe }}
				Tag Label
			</ng-doc-selector>`,
		dynamicContent: {
			iconContent: {
				label: 'icon',
				template: '<ng-doc-icon icon="info" [size]="16"></ng-doc-icon>'
			}
		}
	}
};

export default PagePlayground;
```

#### Output

NgDoc will create new control in the `Content` section that allows you to display or hide dynamic
content.

{{ NgDocActions.playground("TagIconPlayground") }}

### Custom data and variables

To make your playgrounds more lively and dynamic you can use `data` field,
for example, you decided to show how a component that should display a list of elements works, but
it won’t work without the list itself, to fix this you can use the `data` field in your playground
configuration,
and put there any data you want.

```typescript
import {NgDocPlayground} from '@ng-doc/builder';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

const PagePlayground: NgDocPlayground = {
	TagPlayground: {
		target: NgDocTagComponent,
		template: `<ng-doc-selector>{{ "{{data.array | json}}" | safe }}</ng-doc-selector>`,
		data: {
			array: [1, 2, 3]
		}
	}
};

export default PagePlayground;
```

#### Output

And here we go, the data that was provided in the configuration now is displaying in the playground

{{ NgDocActions.playground("TagDataPlayground") }}

## Custom type controls and type recognition

NgDoc can recognize some custom types, such as the simplest `Type Alias` types, but sometimes your
components may contain `@Input` properties that have more complex types, interfaces or classes.
To help NgDoc recognize them, you can create your own control component that will process these
types,
you can read how to do this in the `*CustomizationTypeControls` article.

## See Also

- `*EntitiesPage`
- `*EntitiesDependencies`
- `*CustomizationTypeControls`
