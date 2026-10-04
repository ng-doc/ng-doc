---
keyword: PlaygroundsPage
---

A playground renders a component, a directive or a pipe next to an inspector with a control for
each of its inputs. Readers change the values and see the result and its code at once, without
writing a demo for every state.

## 👀 See it

{{ NgDocActions.playground("TagPlayground") }}

The demo sits on the left, and the inspector on the right. When the playground is narrower than
640 pixels, the inspector moves below the demo.

- **Settings** has a row for each input: its name, a chip with the type of its value, and a
  control. Hover the name to read the input's description, taken from its doc comment.
- **Recreate** creates the demo again every time an input changes, instead of updating the inputs
  of the same instance. Use it for components that read an input only once, and turn it on from
  the start with the `recreate` option (see "Options").
- **Reset** appears as soon as a value differs from its default, and sets every input back.
- The code button beside the demo shows, below it, the template of the current state.

## 🧰 Use it

1. Add the playground to the `playgrounds` of the page. The key is the name of the playground:

   ```typescript name="ng-doc.page.ts"
   import { NgDocPage } from '@ng-doc/core';
   import { NgDocTagComponent } from '@ng-doc/ui-kit';

   const MyPage: NgDocPage = {
     title: 'Tag',
     mdFile: './index.md',
     playgrounds: {
       TagPlayground: {
         target: NgDocTagComponent,
         template: `<ng-doc-selector>Tag Label</ng-doc-selector>`,
       },
     },
   };

   export default MyPage;
   ```

2. Render it in the Markdown with the `playground` action:

   ```twig name="index.md"
   {{ '{{ NgDocActions.playground("TagPlayground") }}' | safe }}
   ```

`target` is the class to play with. `template` is the Angular template that renders it, and
`<ng-doc-selector>` stands for the target's selector. Prefer it to the real selector: the
playground keeps working when you rename the selector. A standalone target needs no imports; for a
target declared in an NgModule, add the module to the `imports` of the page.

The template is static text: it can't read variables or call functions of the page. Use
`data` for values (see below).

## 🧪 Inputs and controls

NgDoc reads the inputs of the target when it builds the page: signal inputs (`input()` and
`model()`, required or not), `@Input()` properties, and the inputs of its base classes. An
alias becomes the name of the row. The type of the input chooses the control:

| Type of the input                      | Control                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `string`                               | A text field.                                                            |
| `number`                               | A number field.                                                          |
| `boolean`                              | A checkbox.                                                              |
| A union of literals, or an alias of it | A list of the values, such as `'small' \| 'medium' \| 'large'`.          |
| A type with a type control             | Your control (`*CustomTypeControlsPage`).                                |
| Any other type                         | No control. In development, the browser console names the skipped input. |

For a signal input, the type is the type argument: `size = input<NgDocSize>('small')` gets the list
of `NgDocSize`. An input with a transform, such as
`rounded = input<boolean, unknown>(false, { transform: booleanAttribute })`, gets the control of
its first type argument, here a checkbox. An optional or nullable `string`, `number` or `boolean`
input, such as `label = input<string>()`, gets the control of its type too.

The list of a union shows the values in the order the type is written. `NgDocSize` is written
`'small' | 'medium' | 'large'`, so its list starts with `small`. The default value of the input is
marked in the list.

## Multiple selectors

When the target has several selectors, NgDoc renders a demo for each of them. To render only some,
set `selectors` in the configuration or in the action:

```twig name="index.md"
{{ '{{ NgDocActions.playground("ButtonPlayground", { selectors: "button[ng-doc-button-flat]" }) }}' | safe }}
```

{{ NgDocActions.playground("ButtonPlayground") }}

## Inputs set in the template

An input that the template sets gets no control. So you can bind an input to something that a
control can't edit, such as a reference to another element:

```typescript name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';

import { TooltipComponent } from './tooltip.component';

const MyPage: NgDocPage = {
  title: 'Tooltip',
  mdFile: './index.md',
  playgrounds: {
    TooltipPlayground: {
      target: TooltipComponent,
      template: `
        <ng-doc-selector [anchor]="anchor">Hello</ng-doc-selector>
        <input #anchor value="Hover me" />
      `,
    },
  },
};

export default MyPage;
```

To start with a value and keep the control, use the `inputs` or `defaults` options instead (see
"Options").

## Optional content

`content` adds toggles for parts of the template, for example the content that a component
projects. Each key is a slot: write `{{ '{{ content.<key> }}' }}` where it goes in the template.
The inspector lists the slots under **Content**:

```typescript name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';
import { NgDocIconComponent, NgDocTagComponent } from '@ng-doc/ui-kit';

const MyPage: NgDocPage = {
  title: 'Tag',
  mdFile: './index.md',
  imports: [NgDocIconComponent],
  playgrounds: {
    TagIconPlayground: {
      target: NgDocTagComponent,
      template: `
        <ng-doc-selector>
          {{ '{{ content.icon }}' }}
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

export default MyPage;
```

A component in a slot template must be in the `imports` of the page.

{{ NgDocActions.playground("TagIconPlayground") }}

## Data

`data` passes values to the template, which reads them as `data`:

```typescript name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';
import { NgDocTagComponent } from '@ng-doc/ui-kit';

const MyPage: NgDocPage = {
  title: 'Tag',
  mdFile: './index.md',
  playgrounds: {
    TagDataPlayground: {
      target: NgDocTagComponent,
      template: `<ng-doc-selector>{{ '{{ data.array | json }}' }}</ng-doc-selector>`,
      data: {
        array: [1, 2, 3],
      },
    },
  },
};

export default MyPage;
```

{{ NgDocActions.playground("TagDataPlayground") }}

## Directives and pipes

A directive works like a component. The template applies it to an element:

```typescript name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';
import { NgDocRotatorDirective } from '@ng-doc/ui-kit';

const MyPage: NgDocPage = {
  title: 'Rotator',
  mdFile: './index.md',
  playgrounds: {
    RotatorPlayground: {
      target: NgDocRotatorDirective,
      template: `<button ngDocRotator>Button</button>`,
    },
  },
};

export default MyPage;
```

{{ NgDocActions.playground("RotatorPlayground") }}

For a pipe, the parameters of `transform` after the value are the inputs. Take this pipe:

```typescript name="format-date.pipe.ts" file="./format-date.pipe.ts"

```

The template applies the pipe to a value, without parameters: NgDoc binds them to the controls.

```typescript name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';

import { FormatDatePipe } from './format-date.pipe';

const MyPage: NgDocPage = {
  title: 'Format date',
  mdFile: './index.md',
  playgrounds: {
    DatePipePlayground: {
      target: FormatDatePipe,
      template: `{{ "{{ '2023-06-05T08:00:00.000Z' | formatDate }}" }}`,
    },
  },
};

export default MyPage;
```

{{ NgDocActions.playground("DatePipePlayground") }}

The descriptions come from the `@param` tags of `transform`, and the defaults from its default
parameter values.

## 📋 Options

Set options in the configuration of the playground, or as the second argument of the action. The
action's options win. They follow `NgDocPlaygroundOptions`:

| Option              | Type                      | Default   | Description                                                                         |
| ------------------- | ------------------------- | --------- | ----------------------------------------------------------------------------------- |
| `selectors`         | `string \| string[]`      | All       | The selectors to render a demo for.                                                 |
| `expanded`          | `boolean`                 | `false`   | Shows the code under the demo when the playground opens.                            |
| `hideSidePanel`     | `boolean`                 | `false`   | Hides the inspector and shows only the demo.                                        |
| `inspectorPosition` | `'right' \| 'bottom'`     | `'right'` | Puts the inspector right of the demo, or below it so the demo gets the full width.  |
| `recreate`          | `boolean \| 'always'`     | `false`   | Starts with **Recreate** on. `'always'` keeps it on and hides the setting.          |
| `inputs`            | `Record<string, unknown>` | –         | Values for the inputs when the playground opens. **Reset** returns to the defaults. |
| `defaults`          | `Record<string, unknown>` | –         | Defaults for the controls, instead of the target's own. **Reset** returns to them.  |
| `hiddenInputs`      | `string[]`                | –         | Inputs that get no control.                                                         |
| `data`              | `Record<string, unknown>` | –         | Values for the template. The action's `data` extends the configuration's.           |

This playground hides the inspector, and starts with a rounded button:

```twig name="index.md"
{{ '{{ NgDocActions.playground("ButtonPlayground", { hideSidePanel: true, selectors: "button[ng-doc-button-flat]", inputs: { rounded: true }, data: { label: "Rounded Button" } }) }}' | safe }}
```

{{ NgDocActions.playground("ButtonPlayground", {
hideSidePanel: true,
selectors: "button[ng-doc-button-flat]",
inputs: {rounded: true},
data: {label: "Rounded Button"} })
}}

For a large component, put the inspector below the demo. The demo gets the full width, and the
controls flow into columns:

```twig name="index.md"
{{ '{{ NgDocActions.playground("TagPlayground", { inspectorPosition: "bottom" }) }}' | safe }}
```

{{ NgDocActions.playground("TagPlayground", { inspectorPosition: "bottom" }) }}

## Controls for other inputs

NgDoc doesn't see inputs declared in the `inputs` of the `@Component` decorator. Add them with
`controls`, keyed by property name. The value is the type of the input, or an
`NgDocPlaygroundControlConfig`:

```typescript name="ng-doc.page.ts"
import { NgDocPage } from '@ng-doc/core';

import { BadgeComponent } from './badge.component';

const MyPage: NgDocPage = {
  title: 'Badge',
  mdFile: './index.md',
  playgrounds: {
    BadgePlayground: {
      target: BadgeComponent,
      template: `<ng-doc-selector>New</ng-doc-selector>`,
      controls: {
        label: 'string',
        count: { type: 'number', alias: 'badgeCount', description: 'The number to show.' },
        size: { type: 'NgDocTypeAlias', options: ['small', 'medium', 'large'] },
      },
    },
  },
};

export default MyPage;
```

An entry in `controls` also replaces the control that NgDoc chose for an input of the same name. The
type `NgDocTypeAlias` shows a list of `options`; a type registered with `provideTypeControl` shows
your control.

## 🚧 Gotchas

> **Warning**
> In the action's options, put a space between two closing braces, such as `{ inputs: { a: 1 } }`.
> Without it, Nunjucks reads `}}` as the end of the expression.

> **Note**
> The legacy builders list the values of a union in the order the TypeScript checker created them,
> which can differ from the written order (`*UpgradeTo22Page#7-the-new-engine`).

{% index false %}

## Related

- `*CustomTypeControlsPage`
- `*DemosPage`
- `*PageFilesReference#playground-configuration`

{% endindex %}

Next: `*CustomTypeControlsPage`
