---
keyword: CustomTypeControlsPage
---

A playground has built-in controls for strings, numbers, booleans and unions of literals. For an
input of any other type, such as an interface, write a type control: a small form component that
edits a value of that type. Once you register it, every playground uses it for inputs of that type.

## 👀 See it

`FloatingCircleComponent` places a circle with its `position` input, an object with `top` and
`left`:

{{ NgDocActions.demo("FloatingCircleComponent") }}

NgDoc can't edit a `FloatingCirclePosition` by itself, so a playground of this component would skip
the input. With a type control for the type, the inspector shows two fields instead:

{{ NgDocActions.playground("FloatingCircle") }}

## 🧰 Use it

1. Write a component that implements `NgDocTypeControl`. It is a `ControlValueAccessor`: the
   playground writes the value of the input with `writeValue()`, and the control reports changes
   through the function it gets in `registerOnChange()`. The control of this page is below.
2. Register it for the type with `provideTypeControl`, in the providers of your application:

   ```typescript name="app.config.ts"
   import { ApplicationConfig } from '@angular/core';
   import { provideTypeControl } from '@ng-doc/app';

   import { FloatingCirclePositionControlComponent } from './floating-circle-position-control.component';

   export const appConfig: ApplicationConfig = {
     providers: [
       provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
         hideLabel: true,
       }),
     ],
   };
   ```

   When only one page uses the control, you can register it in the `providers` of that page
   instead, as this page does.

3. Render a playground of a component with an input of that type (`*PlaygroundsPage`).

The control of the playground above:

{{ NgDocActions.demo("FloatingCirclePositionControlComponent", { expanded: true, tabs: ["TypeScript"] }) }}

## Fields of a type control

Before the control renders, the playground sets these fields of `NgDocTypeControl`. Declare the
ones you need, as signal inputs or as plain fields:

| Field         | Type                    | Value                                                                             |
| ------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `name`        | `string`                | The name of the input.                                                            |
| `description` | `string`                | The description of the input, from its doc comment, as HTML.                      |
| `default`     | the type of the control | The default value of the input.                                                   |
| `options`     | `string[]`              | The members of the input's union type, as written in code, such as `"'small'"`.   |
| `isManual`    | `boolean`               | `true` when the input comes from `controls` in the configuration of a playground. |

The playground sets a field that the control declares as an input, a signal input or an `@Input()`,
with `setInput()`, so `ngOnChanges()` reports it. It assigns a plain field. With signal inputs,
read the fields by calling them, such as `this.default()`.

### Type the value of an input

The value that a control edits is the value the input accepts. `InputType` from `@ng-doc/core`
resolves it from the component: for a signal input, it is the type the input is set with, before
any transform; for an `@Input()` property, it is the property type.

```typescript name="position-control.component.ts"
import { NgDocTypeControl } from '@ng-doc/app';
import { InputType } from '@ng-doc/core';

import { FloatingCircleComponent } from './floating-circle.component';

// FloatingCirclePosition, read from `position = input<FloatingCirclePosition>(...)`
type Position = InputType<FloatingCircleComponent, 'position'>;

export class PositionControlComponent implements NgDocTypeControl<Position> {
  // ...
}
```

The control of this page names `FloatingCirclePosition` directly. `InputType` keeps a control in
step with the input it edits when the input's type changes.

## Registering types

NgDoc finds a type control by the text of the input's type, as TypeScript prints it. For a signal
input, that is the type argument of `input()` or `model()`, required or not. So these inputs need
different registrations:

```typescript name="floating-circle.component.ts"
// Registered as 'FloatingCirclePosition'
readonly position = input<FloatingCirclePosition>({ top: '10px', left: '10px' });
readonly position = input.required<FloatingCirclePosition>();

// Registered as 'FloatingCirclePosition | undefined'
readonly position = input<FloatingCirclePosition>();
@Input() position?: FloatingCirclePosition;
```

One control can serve several types. Make sure it handles every value of each type, here
`undefined`:

```typescript name="app.config.ts"
providers: [
  provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
    hideLabel: true,
  }),
  provideTypeControl('FloatingCirclePosition | undefined', FloatingCirclePositionControlComponent, {
    hideLabel: true,
  }),
],
```

The built-in `string`, `number` and `boolean` controls need no such registration: they also edit
optional and nullable inputs of their type, such as `@Input() label?: string`, `input<string>()`,
`model<number>()` or `input<boolean | null>(null)`. Your own types match by their exact text only.

In development, the browser console names the type of every input that a playground skips, so you
can copy the text to register.

## 📋 Options

The third argument of `provideTypeControl` takes `NgDocTypeControlProviderOptions`:

| Option      | Type      | Default | Description                                                                                 |
| ----------- | --------- | ------- | ------------------------------------------------------------------------------------------- |
| `hideLabel` | `boolean` | `false` | Hides the row's label, with the input's name and type chip, for a control that has its own. |
| `order`     | `number`  | –       | The position of the control's rows in the inspector, lowest first.                          |

The inspector lists the inputs whose controls have an `order` first, by that order, and then the
others by name. The built-in controls have these orders:

| Control                         | Type             | Order |
| ------------------------------- | ---------------- | ----- |
| A list of the values of a union | `NgDocTypeAlias` | 10    |
| A text field                    | `string`         | 20    |
| A number field                  | `number`         | 30    |
| A checkbox                      | `boolean`        | 40    |

## Appearance

Build the control from the components of `@ng-doc/ui-kit`, as the built-in controls do, so it
matches the inspector: `NgDocInputWrapperComponent` with `NgDocInputStringDirective` or
`NgDocInputNumberDirective` for fields, `NgDocLabelComponent` for labels, and
`NgDocCheckboxComponent` for checkboxes. The inspector sets these variables:

| Variable                              | Default                 | Description                                 |
| ------------------------------------- | ----------------------- | ------------------------------------------- |
| `--ng-doc-playground-inspector-width` | `312px`                 | The width of the inspector beside the demo. |
| `--ng-doc-playground-input-border`    | `--ng-doc-input-border` | The border of the inputs in the inspector.  |

## 🚧 Gotchas

> **Warning**
> Type names are compared as text, so a registration of `FloatingCirclePosition|undefined`, without
> the spaces that TypeScript prints, matches no input.

<ng-doc-blockquote type="note" label="💡 Tip">

A control registered in the `providers` of a page is registered when the code of that page loads.
Register controls that the playgrounds of several pages use in the providers of your application.

</ng-doc-blockquote>

{% index false %}

## Related

- `*PlaygroundsPage`
- `*UpgradeTo22Page#5-custom-type-controls-and-page-skeleton-components`

{% endindex %}

Next: `*GenerateApiPagesPage`
