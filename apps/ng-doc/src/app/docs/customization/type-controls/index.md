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

To make it available for playgrounds, it must be declared and registered in `AppModule`, to do this,
create a module for this component in which it will be declared and registered as a type control,
this will allow you to simply import the module in the `AppModule` in the future.

```typescript file="./floating-circle-position-control/floating-circle-position-control.module.ts" fileName="floating-circle-position-control.module.ts"

```

And now you can import your module into your root module to make it available for playgrounds.

```typescript fileName="app.module.ts"
import {NgModule} from '@angular/core';
import {FloatingCirclePositionControlModule} from './floating-circle-position-control/floating-circle-position-control.module';

import {AppComponent} from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [FloatingCirclePositionControlModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

## Using Type Control in the playground

Now all you need to do is import your type control's module into `AppModule`, after which you can
create a playground for the `FloatingCircleComponent` component, in which the `position` input will
be replaced by your type control, and you can start playing with `position` values.

{{ NgDocActions.playground("FloatingCircle") }}

## Registering types

In the example above, we registered a type control for the `FloatingCirclePosition` type like this:

```typescript fileName="floating-circle-position-control.module.ts"
@NgModule({
  providers: [
    provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
      hideLabel: true,
    }),
  ],
})
export class FloatingCirclePositionControlModule {}
```

And it worked, but you should remember, that NgDoc is sensitive to the type name, so if you change
the type of the `position` input and make it possible to be `undefined`:

```typescript fileName="floating-circle.component.ts"
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

```typescript fileName="floating-circle-position-control.module.ts"
@NgModule({
  providers: [
    provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
      hideLabel: true,
    }),
    provideTypeControl('FloatingCirclePosition | undefined', FloatingCirclePositionControlComponent, {
      hideLabel: true,
    }),
  ],
})
export class FloatingCirclePositionControlModule {}
```

## Appearance of controls

In order for your custom controls to better fit into the documentation design, you can use
components from our UI-Kit library, and global CSS variables we will provide documentation for it
later, when our API stabilizes.

{% index false %}

## See Also

- `*ContentGuidesPlayground`

{% endindex %}
