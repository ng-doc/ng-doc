# {{ NgDocPage.title }}

Playgrounds can recognize some simple types and create controls for them dynamically, but for inputs
that have more complex types such as an interface or a class, this will not work, the fact is that
NgDoc does not know what your type is and how to interact with it correctly, in this
article we will show you how you can create controls for your types so that NgDoc can understand
them.

## Component for the playground

First, let's create a component that will have an input type as an interface.
Let's say we have a simple component that renders a circle in a container that has a single input
that can be passed positions, and it looks like this

{{ NgDocActions.demo("FloatingCircleComponent") }}

If we try to display it in the playground, NgDoc will write in the console that it skipped
the `position` input, because it cannot recognize its type. Let's teach NgDoc to understand
the `FloatingCirclePosition` type we created in the component.

## Creating Type Control

Type control is an extended `ControlValueAccessor` in which NgDoc adds additional
information, such as the name of an input or its description based on a comments to your code.
To create it you need to implement `NgDocTypeControl` interface in your component, so,
let's create it.

{{ NgDocActions.demo("FloatingCirclePositionControlComponent") }}

As you can see, this is a typical `ControlValueAcessor` that processes new values and emits new ones
when one of the positions was changed.

## Registering Type Control

To make it available for playgrounds, it must be provided on the root level of your application,
you can do this by providing it in the `providers` array by using the `provideTypeControl` function.

```typescript name="main.ts"
import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';
import {provideTypeControl} from '@ng-doc/app';

bootstrapApplication(AppComponent, {
  providers: [
    // Registering type control `FloatingCirclePositionControlComponent` for `FloatingCirclePosition` type
    provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
      hideLabel: true,
    }),
  ],
}).catch((err: unknown) => console.error(err));
```

## Using Type Control in the playground

That's all, now if you create a playground for the `FloatingCircleComponent` component,
`position` input will be replaced by your type control, and you can start playing with `position`
values.

{{ NgDocActions.playground("FloatingCircle") }}

## Registering types

In the example above, we registered a type control for the `FloatingCirclePosition` type like this:

```typescript name="main.ts"
import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';
import {provideTypeControl} from '@ng-doc/app';

bootstrapApplication(AppComponent, {
  providers: [
    provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
      hideLabel: true,
    }),
  ],
}).catch((err: unknown) => console.error(err));
```

And it worked, but you should remember, that NgDoc is sensitive to the type name, so if you change
the type of the `position` input and make it possible to be `undefined`:

```typescript name="floating-circle.component.ts"
@Component({
  selector: 'ng-doc-floating-circle',
  templateUrl: './floating-circle.component.html',
  styleUrls: ['./floating-circle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloatingCircleComponent {
  @Input()
  position?: FloatingCirclePosition = {top: '10px', left: '10px'};
}
```

Then you will need to register a new type control for the `FloatingCirclePosition | undefined` type,
and make sure that your type control can handle `undefined` values. You can register multiple types
for a single type control at the same time, for example:

```typescript name="main.ts"
import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';
import {provideTypeControl} from '@ng-doc/app';

bootstrapApplication(AppComponent, {
  providers: [
    provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
      hideLabel: true,
    }),
    provideTypeControl(
      'FloatingCirclePosition | undefined',
      FloatingCirclePositionControlComponent,
      {
        hideLabel: true,
      },
    ),
  ],
}).catch((err: unknown) => console.error(err));
```

## Ordering

NgDoc orders type controls by the order property which is set in the `provideTypeControl` function
and the name of the `@Input` property, so if you want to change the order of your type control,
you can do it by changing the order property.

```typescript name="main.ts"
import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';
import {provideTypeControl} from '@ng-doc/app';

bootstrapApplication(AppComponent, {
  providers: [
    provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
      order: 1,
    }),
  ],
}).catch((err: unknown) => console.error(err));
```

Below is a list of order values for the types that are already registered in NgDoc, so you can
use them to set the order of your type controls.

- `TypeAlias` - 10
- `string` - 20
- `number` - 30
- `boolean` - 40

## Appearance of controls

In order for your custom controls to better fit into the documentation design, you can use
components from our UI-Kit library, and global CSS variables we will provide documentation for it
later, when our API stabilizes.

{% index false %}

## See Also

- `*GuidesPlayground`

{% endindex %}
