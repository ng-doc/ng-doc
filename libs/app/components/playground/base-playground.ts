import {
  ChangeDetectorRef,
  Directive,
  inject,
  Input,
  OnInit,
  Type,
  ViewContainerRef,
} from '@angular/core';
import { extractFunctionDefaults } from '@ng-doc/core/helpers/extract-function-defaults';
import { NgDocPlaygroundConfig } from '@ng-doc/core/interfaces';
import { Constructor } from '@ng-doc/core/types';
import { Observable, Subject, take } from 'rxjs';

import { NgDocPlaygroundComponent } from './playground.component';

/**
 * Base class for playgrounds components.
 */
@Directive()
export abstract class NgDocBasePlayground implements Pick<NgDocPlaygroundConfig, 'data'>, OnInit {
  static readonly selector: string = 'unknown';
  abstract readonly playground?: Type<any>;
  abstract readonly viewContainerRef?: ViewContainerRef;
  abstract readonly configData: Record<string, unknown>;

  @Input()
  properties: Record<string, any> = {};

  @Input()
  actionData: Record<string, unknown> = {};

  @Input()
  content: any = {};

  defaultValues: Record<string, unknown> = {};

  private reattached: Subject<void> = new Subject<void>();

  private playgroundContainer: NgDocPlaygroundComponent = inject(NgDocPlaygroundComponent);
  protected changeDetectorRef: ChangeDetectorRef = inject(ChangeDetectorRef);

  protected constructor(private playgroundInstance?: Constructor<unknown>) {
    this.changeDetectorRef.detach();
  }

  get onReattached(): Observable<void> {
    return this.reattached.pipe(take(1));
  }

  ngOnInit(): void {
    /*
     * Extract default values from playground properties. We do this in `ngOnInit` because in this case
     * input values provided from the template are not initialized yet, and we can read default values instead.
     */
    if (this.playground) {
      this.defaultValues = Object.keys(this.playground).reduce(
        (values: Record<string, unknown>, key: string) => {
          if (this.playground) {
            try {
              values[key] =
                // @ts-expect-error we do not know the type of the playground
                typeof this.playground[key] === 'function'
                  ? // @ts-expect-error we do not know the type of the playground
                    this.playground[key]()
                  : // @ts-expect-error we do not know the type of the playground
                    this.playground[key];
            } catch (e) {
              // we do catch here because some of the playground properties can be getters and throw an error
            }
          }

          return values;
        },
        {},
      );
    } else if (this.playgroundInstance) {
      const defaults = extractFunctionDefaults(this.playgroundInstance.prototype.transform);

      this.defaultValues = Object.keys(this.playgroundContainer.properties ?? {}).reduce(
        (def: Record<string, unknown>, key: string, i: number) => {
          // we do +1 because the first argument is the `value` of the transform function
          def[key] = defaults[i + 1];

          return def;
        },
        {},
      );
    } else {
      throw new Error('Playground is not defined or initialized');
    }

    if (!this.playgroundContainer.defaultValues) {
      this.playgroundContainer.defaultValues = this.defaultValues;
    }

    /*
             This is a hack just to wait for the playground container to be initialized and only then
             attach the change detector to have correct inputs values.
         */
    Promise.resolve().then(() => {
      this.changeDetectorRef.reattach();
      this.reattached.next();
    });
  }

  get data(): any {
    return Object.assign({}, this.configData, this.actionData);
  }
}
