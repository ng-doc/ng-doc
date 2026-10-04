import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  inject,
  InjectionToken,
  Injector,
  input,
  InputSignal,
  OnChanges,
  OnDestroy,
  PendingTasks,
  Signal,
  signal,
  SimpleChanges,
  Type,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';
import { NgDocDemoDisplayerComponent } from '@ng-doc/app/components/demo-displayer';
import { formatHtml } from '@ng-doc/app/helpers';
import { getPlaygroundDemoToken } from '@ng-doc/app/providers/playground-demo';
import { NgDocFormPartialValue } from '@ng-doc/app/types';
import {
  buildPlaygroundDemoPipeTemplate,
  buildPlaygroundDemoTemplate,
} from '@ng-doc/core/helpers/build-playground-demo-template';
import { objectKeys } from '@ng-doc/core/helpers/object-keys';
import { stringify } from '@ng-doc/core/helpers/stringify';
import { NgDocPlaygroundConfig, NgDocPlaygroundProperties } from '@ng-doc/core/interfaces';
import { Subject } from 'rxjs';
import { startWith, takeUntil } from 'rxjs/operators';

import { NgDocBasePlayground } from '../base-playground';
import { NgDocPlaygroundForm } from '../playground-form';

/**
 * One demo of a playground: it creates the generated playground class of its selector (or pipe),
 * passes it the form's values and shows the code of the current state.
 */
@Component({
  selector: 'ng-doc-playground-demo',
  templateUrl: './playground-demo.component.html',
  styleUrls: ['./playground-demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocDemoDisplayerComponent],
})
export class NgDocPlaygroundDemoComponent<
    T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties,
  >
  implements OnChanges, OnDestroy
{
  /** The name of the playground in the page configuration. */
  readonly id: InputSignal<string> = input<string>('');

  /** The name of the pipe, when the target is a pipe. */
  readonly pipeName: InputSignal<string> = input<string>('');

  /** The selector of the target this demo renders. */
  readonly selector: InputSignal<string> = input<string>('');

  /** The playground configuration, extended by the action's options. */
  readonly configuration: InputSignal<NgDocPlaygroundConfig | undefined> = input<
    NgDocPlaygroundConfig | undefined
  >(undefined);

  /** The inputs of the target. */
  readonly properties: InputSignal<T | undefined> = input<T | undefined>(undefined);

  /** Whether the demo is created again each time a value changes. */
  readonly recreateDemo: InputSignal<boolean> = input<boolean>(false);

  /** The values of the inputs and content slots. */
  readonly form: InputSignal<FormGroup<NgDocPlaygroundForm> | undefined> = input<
    FormGroup<NgDocPlaygroundForm> | undefined
  >(undefined);

  /** Whether the code of the demo is shown. */
  readonly expanded: InputSignal<boolean> = input<boolean>(false);

  /** Where the playground class is created. */
  readonly demoOutlet: Signal<ViewContainerRef | undefined> = viewChild('demoOutlet', {
    read: ViewContainerRef,
  });

  /** The generated playground class of this demo's selector or pipe. */
  playgroundDemo?: typeof NgDocBasePlayground;

  protected readonly code = signal('');

  protected readonly injector = inject(Injector);
  protected readonly destroyRef = inject(DestroyRef);
  private readonly pendingTasks = inject(PendingTasks);

  private demoRef?: ComponentRef<NgDocBasePlayground>;
  private readonly unsubscribe$: Subject<void> = new Subject<void>();

  async ngOnChanges({ form, id }: SimpleChanges): Promise<void> {
    if (form || id) {
      this.unsubscribe$.next();

      const demoInjector: InjectionToken<Array<typeof NgDocBasePlayground>> | undefined =
        getPlaygroundDemoToken(this.id());

      if (demoInjector) {
        const demos: Array<typeof NgDocBasePlayground> = this.injector.get(demoInjector, []);

        this.playgroundDemo = demos.find(
          (demo: typeof NgDocBasePlayground) =>
            demo.selector === this.selector() || demo.selector === this.pipeName(),
        );
      }

      await this.updateDemo();

      const form = this.form();

      form?.valueChanges
        .pipe(
          startWith(form.value),
          takeUntil(this.unsubscribe$),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((data: NgDocFormPartialValue<FormGroup<NgDocPlaygroundForm>>) =>
          this.updateDemo(data),
        );
    }
  }

  private async updateDemo(
    data?: NgDocFormPartialValue<FormGroup<NgDocPlaygroundForm>>,
  ): Promise<void> {
    if (this.recreateDemo() || !this.demoRef) {
      this.createDemo();
    }

    if (data) {
      this.demoRef?.setInput('properties', data.properties ?? {});
      this.demoRef?.setInput('content', data.content ?? {});
      this.demoRef?.setInput('actionData', this.configuration()?.data ?? {});

      if (this.recreateDemo()) {
        this.demoRef?.instance.onReattached.subscribe(() => {
          this.demoRef?.changeDetectorRef.detectChanges();
        });
      }
    }

    await this.updateCodeView();
  }

  private createDemo(): void {
    if (this.playgroundDemo) {
      this.demoRef?.destroy();
      this.demoRef = this.demoOutlet()?.createComponent(
        this.playgroundDemo as unknown as Type<NgDocBasePlayground>,
      );
      this.demoRef?.changeDetectorRef.markForCheck();
    }
  }

  private async updateCodeView(): Promise<void> {
    const template: string = this.pipeName()
      ? buildPlaygroundDemoPipeTemplate(
          this.configuration()?.template ?? '',
          this.pipeName(),
          this.getActiveContent(),
          this.getPipeActiveInputs(),
        )
      : buildPlaygroundDemoTemplate(
          this.configuration()?.template ?? '',
          this.selector(),
          this.getActiveContent(),
          this.getActiveInputs(),
        );

    // Formatting loads the formatter asynchronously. Zoneless SSR waits only for pending tasks, so
    // the page would otherwise be serialized before the code view is filled.
    const done = this.pendingTasks.add();

    try {
      this.code.set(await formatHtml(template));
    } finally {
      done();
    }
  }

  private getActiveContent(): Record<string, string> {
    const formData: Record<string, boolean> =
      (this.form()?.controls.content.value as Record<string, boolean>) ?? {};

    return objectKeys(formData).reduce((result: Record<string, string>, key: string) => {
      result[key] = formData[key] ? this.configuration()?.content?.[key].template ?? '' : '';

      return result;
    }, {});
  }

  private getActiveInputs(): Record<string, string> {
    const formData: Record<string, unknown> =
      (this.form()?.controls.properties.value as Record<string, unknown>) ?? {};

    return objectKeys(formData).reduce((result: Record<string, string>, key: string) => {
      const inputName = this.properties()?.[key]?.inputName ?? key;
      const value: unknown = formData[key];
      const property: unknown | undefined = this.demoRef?.instance?.defaultValues[key];

      if (property !== value) {
        result[inputName] = stringify(value).replace(/"/g, `'`);
      }

      return result;
    }, {});
  }

  private getPipeActiveInputs(): Record<string, string> {
    const formData: Record<string, unknown> =
      (this.form()?.controls.properties.value as Record<string, unknown>) ?? {};
    let changedInputIndex: number = -1;

    return objectKeys(formData)
      .map((key: string, i: number) => {
        const value: unknown = formData[key];
        const defaultValue: unknown | undefined = this.demoRef?.instance?.defaultValues[key];

        if (defaultValue !== value) {
          changedInputIndex = i;
        }

        return key;
      })
      .slice(0, changedInputIndex + 1)
      .reduce((result: Record<string, string>, key: string) => {
        result[key] = stringify(formData[key]).replace(/"/g, `'`);

        return result;
      }, {});
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
