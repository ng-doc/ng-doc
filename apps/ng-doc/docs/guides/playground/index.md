# {{ NgDocPage.title }}

The Playground is another cool feature that NgDoc provides out of the box, it's especially handy for
creating dynamic demos of your components and directives, to give your users the opportunity to play
with them.

## Creating a playground

In the `ng-doc.page.ts` file, add the `playgrounds` field, which must match the
`NgDocPlaygroundConfig` interface. A playground config is a regular object whose key is the name of
the playground (which you should use to display it on the page) and whose value is the config
itself, for example:

> **Note**
> For the template you can also use your real selector, but we recommend using `ng-doc-selector` to
> avoid cases where your playgrounds stop working when the selector is changed during refactoring.

> **Note**
> If you don't need to render all possible selectors of your component, you can use the `selector`
> field to specify the selectors that you want to see in your playground.

> **Note**
> If your target component is standalone, you don't need to import anything, NgDoc will care about
> it.

```typescript name="ng-doc.page.ts"
import {NgDocPage} from '@ng-doc/core';
import {NgDocTagModule, NgDocTagComponent} from '@ng-doc/ui-kit';

import {PageModule} from './ng-doc.module';

const MyAwesomePage: NgDocPage = {
  playgrounds: {
    TagPlayground: {
      target: NgDocTagComponent,
      template: `<ng-doc-selector>Tag Label</ng-doc-selector>`,
    },
  },
};

export default MyAwesomePage;
```

- `target` - The Angular Component/Directive class that will be used for the playground (you
  should import its module in the `imports` field if it's not standalone)
- `template` - The template that will be used for the playground, you can use the Angular syntax
  inside,
  but it's value cannot be provided dynamically, so you can't use variables or functions there,
  value of this property should be static.
- `<ng-doc-selector>` - is a unique tag that will be dynamically replaced with your component's
  selector, and if your component has multiple selectors, NgDoc will also create a view for each
  possible selector.

## Displaying

To display the created playground on the page, you should use the `playground` method
from `NgDocActions`, passing the key of your playground to it as follows

```twig name="index.md"
{{'{{ NgDocActions.playground("TagPlayground") }}' | safe }}
```

NgDoc will recognize `@Input` field types and creates controls for them, which allow you to change
their values and see how the component changes.

{{ NgDocActions.playground("TagPlayground") }}

## Input types recognition

There is no magic, NgDoc can only recognize simple type such as `string`, `number`, `boolean`,
or Type Alias types which are union of `string`, `number`, `boolean`.

It can't recognize complex types such as `Interface`, `Class` or `Enum`, but you can create your
own custom controls for them to teach NgDoc doing that, read more about it in
the `*CustomizationTypeControls`.

## Multiple selectors

If your component has multiple selectors, NgDoc will create a view for each of them, to make it
work correctly, you need to use the `ng-doc-selector` tag in your template, which will be replaced
with the selector of your component.

> **Note**
> If you don't need to render all possible selectors of your component, you can use the `selectors`
> field in the playground configuration or action call to specify the selectors that you want to see
> in your playground.

```typescript name="ng-doc.page.ts" {8}
import {NgDocPage} from '@ng-doc/core';
import {NgDocButtonComponent} from '@ng-doc/ui-kit';

const MyAwesomePage: NgDocPage = {
  playgrounds: {
    TagPlayground: {
      target: NgDocButtonComponent,
      template: `<ng-doc-selector>Button</ng-doc-selector>`,
    },
  },
};

export default MyAwesomePage;
```

{{ NgDocActions.playground("ButtonPlayground") }}

## Optional content

Some components may support displaying other child components with `ng-content`, and they may be
optional, or you just want to make some content in the playground optional, to do this you can use
the `content` field in your playground configuration, for example:

> **Note**
> If you provide some component in the `content` field, you must import it in the `imports`
> field, if this component is not standalone you must import its module.

```typescript name="ng-doc.page.ts" {11,15-18}
import {NgDocDependencies} from '@ng-doc/core';
import {NgDocTagComponent, NgDocIconComponent} from '@ng-doc/ui-kit';

const PageDependencies: NgDocDependencies = {
  imports: [NgDocIconComponent],
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

NgDoc will create new control in the `Content` section that allows you to display or hide dynamic
content.

{{ NgDocActions.playground("TagIconPlayground") }}

## Custom data and variables

To make your playgrounds more lively and dynamic you can use `data` field,
and put any data you want in it, to use it in your template, for example like that:

```typescript name="ng-doc.page.ts"
import {NgDocDependencies} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

const PageDependencies: NgDocDependencies = {
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

{{ NgDocActions.playground("TagDataPlayground") }}

## Directives

You can also create playgrounds for directives in the same way as for components:

```typescript name="ng-doc.page.ts"
import {NgDocPage} from '@ng-doc/core';
import {NgDocRotatorDirective} from '@ng-doc/ui-kit';

import {PageModule} from './ng-doc.module';

const MyAwesomePage: NgDocPage = {
  playgrounds: {
    RotatorPlayground: {
      // We don't import anything else, because `NgDocRotatorDirective` is standalone
      target: NgDocRotatorDirective,
      template: `<button ngDocRotator>Button</button>`,
    },
  },
};

export default MyAwesomePage;
```

{{ NgDocActions.playground("RotatorPlayground") }}

## Pipes

It's also possible to create playgrounds for pipes, let's say we have a simple `FormatDatePipe`:

```typescript name="format-date.pipe.ts" file="./format-date.pipe.ts"

```

In the same way as for components and directives, you need to use the `target` field to specify the
pipe class, and the `template` field to specify the template for the playground:

> **Warning**
> If your pipe has parameters, you must not provide values for them in the template, because NgDoc
> will bind them to the playground controls.

```typescript name="ng-doc.page.ts"
import {NgDocPage} from '@ng-doc/core';
import {FormatDatePipe} from './format-date.pipe';

import {PageModule} from './ng-doc.module';

const MyAwesomePage: NgDocPage = {
  playgrounds: {
    DatePipePlayground: {
      target: FormatDatePipe,
      template: `{{ "{{'2023-06-05T08:00:00.000Z' | formatDate}}" | safe }}`,
    },
  },
};

export default MyAwesomePage;
```

{{ NgDocActions.playground("DatePipePlayground") }}

## Configuration

Each playground can be configured both in the `ng-doc.page.ts` file and when calling the rendering
function `NgDocActions.playground`. In this case, the configuration from the template will overwrite
the configuration in `ng-doc.page.ts`. You can find all available options in the
`NgDocPlaygroundOptions` interface.

> **Warning**
> Please be careful with the closing brackets `}` in your template, because it can be
> interpreted as the end of the `nunjucks` expression.
> ```twig name="index.md"
> // Will not work
> {{ '{{ NgDocActions.playground("My", {inputs: {a:1}}) }}' | safe }}
> 
> // To fix it, you need to add a space after the closing bracket
> {{ '{{ NgDocActions.playground("My", {inputs: {a:1} }) }}' | safe }}
> ```


For example, you can display a component without the side panel and with modified default input
values like this:

```twig name="index.md"
{{ '{{ NgDocActions.playground("ButtonPlayground", {hideSidePanel: true, selectors: "button[ng-doc-button-flat]", inputs: {size: "small"}, data: {label: "Small Button"} }) }}' | safe }}
```

{{ NgDocActions.playground("ButtonPlayground", {hideSidePanel: true, selectors: "button[ng-doc-button-flat]", inputs: {size: "small"}, data: {label: "Small Button"} }) }}

{% index false %}

## See Also

- `*EntitiesPage`
- `*CustomizationTypeControls`

{% endindex %}
