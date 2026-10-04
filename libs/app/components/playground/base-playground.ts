import {
  ChangeDetectorRef,
  Directive,
  inject,
  input,
  InputSignal,
  OnInit,
  Signal,
  ViewContainerRef,
} from '@angular/core';
import { extractFunctionDefaults } from '@ng-doc/core/helpers/extract-function-defaults';
import { NgDocPlaygroundConfig } from '@ng-doc/core/interfaces';
import { Constructor } from '@ng-doc/core/types';
import { Observable, Subject, take } from 'rxjs';

import { NgDocPlaygroundComponent } from './playground.component';

/**
 * Base class of the playground classes the builder generates, one per playground and selector.
 * A generated class renders the playground template with the target's inputs bound to
 * `properties()`, and queries the target with `viewChild()`.
 */
@Directive()
export abstract class NgDocBasePlayground implements Pick<NgDocPlaygroundConfig, 'data'>, OnInit {
  static readonly selector: string = 'unknown';

  /** The class the playground shows: a component, a directive or a pipe. */
  abstract readonly target: Constructor<unknown>;

  /** The instance of the target in the playground template; a pipe has none. */
  abstract readonly playground: Signal<unknown>;

  /** The view container of the target in the playground template; a pipe has none. */
  abstract readonly viewContainerRef: Signal<ViewContainerRef | undefined>;

  /** The `data` of the playground configuration. */
  abstract readonly configData: Record<string, unknown>;

  /** Values of the target's inputs, by property name. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly properties: InputSignal<Record<string, any>> = input<Record<string, any>>({});

  /** The `data` given to the playground action; it extends the configuration's `data`. */
  readonly actionData: InputSignal<Record<string, unknown>> = input<Record<string, unknown>>({});

  /** Whether each content slot is shown, by slot name. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly content: InputSignal<Record<string, any>> = input<Record<string, any>>({});

  /** The default values of the target's inputs, read before the template binds them. */
  defaultValues: Record<string, unknown> = {};

  private readonly reattached: Subject<void> = new Subject<void>();
  private readonly playgroundContainer: NgDocPlaygroundComponent = inject(NgDocPlaygroundComponent);
  protected readonly changeDetectorRef: ChangeDetectorRef = inject(ChangeDetectorRef);

  constructor() {
    // The view is not checked until the default values of the target are read, so the
    // template's bindings cannot overwrite them first.
    this.changeDetectorRef.detach();
  }

  /** Emits once, after the view is attached again and checks the template's bindings. */
  get onReattached(): Observable<void> {
    return this.reattached.pipe(take(1));
  }

  /** The playground `data`: the configuration's data extended by the action's data. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get data(): any {
    return Object.assign({}, this.configData, this.actionData());
  }

  ngOnInit(): void {
    // The target is created with the view, but the view has not been checked yet, so its inputs
    // still hold their defaults. Signal inputs are read by calling them.
    const playground = this.playground() as Record<string, unknown> | undefined;

    if (playground) {
      this.defaultValues = Object.keys(playground).reduce(
        (values: Record<string, unknown>, key: string) => {
          try {
            const value: unknown = playground[key];

            values[key] = typeof value === 'function' ? value.call(playground) : value;
          } catch {
            // Some properties are getters or functions that throw without their context.
          }

          return values;
        },
        {},
      );
    } else if (this.target) {
      // A pipe: the defaults of its `transform` parameters after the value itself.
      const defaults = extractFunctionDefaults(
        (this.target.prototype as { transform: (...args: unknown[]) => unknown }).transform,
      );

      this.defaultValues = Object.keys(this.playgroundContainer.properties() ?? {}).reduce(
        (values: Record<string, unknown>, key: string, i: number) => {
          values[key] = defaults[i + 1];

          return values;
        },
        {},
      );
    } else {
      throw new Error('Playground is not defined or initialized');
    }

    if (!this.playgroundContainer.defaultValues()) {
      this.playgroundContainer.defaultValues.set(this.defaultValues);
    }

    // The demo sets the playground's inputs right after it creates this view; the view is
    // attached again once they are set, so its first check renders the playground's values.
    Promise.resolve().then(() => {
      this.changeDetectorRef.reattach();
      this.changeDetectorRef.markForCheck();
      this.reattached.next();
    });
  }
}
