import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  effect,
  ElementRef,
  forwardRef,
  Input,
  untracked,
  viewChild,
} from '@angular/core';
import {
  NgDocBaseInput,
  NgDocDisplayValueHost,
  NgDocInputHost,
  NgDocListHost,
  NgDocOverlayHost,
} from '@ng-doc/ui-kit/classes';
import { NgDocDropdownComponent } from '@ng-doc/ui-kit/components/dropdown';
import { NgDocDropdownHandlerDirective } from '@ng-doc/ui-kit/directives/dropdown-handler';
import { NgDocFocusCatcherDirective } from '@ng-doc/ui-kit/directives/focus-catcher';
import { NgDocDisplayValueFunction, NgDocOverlayPosition } from '@ng-doc/ui-kit/types';
import {
  DI_DEFAULT_COMPARE,
  DICompareFunction,
  DICompareHost,
  DIControl,
  DIStateControl,
  injectHostControl,
  provideCompareHost,
  provideHostControl,
} from 'di-controls';
import { filter } from 'rxjs/operators';

/** Connects a text field, a dropdown and a list into a combobox. */
@Component({
  selector: 'ng-doc-combobox-host',
  templateUrl: './combobox-host.component.html',
  styleUrls: ['./combobox-host.component.scss'],
  providers: [
    provideHostControl(forwardRef(() => NgDocComboboxHostComponent)),
    provideCompareHost(forwardRef(() => NgDocComboboxHostComponent)),
    {
      provide: NgDocOverlayHost,
      useExisting: forwardRef(() => NgDocComboboxHostComponent),
    },
    {
      provide: NgDocInputHost,
      useExisting: forwardRef(() => NgDocComboboxHostComponent),
    },
    {
      provide: NgDocDisplayValueHost,
      useExisting: forwardRef(() => NgDocComboboxHostComponent),
    },
    {
      provide: NgDocListHost,
      useExisting: forwardRef(() => NgDocComboboxHostComponent),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocFocusCatcherDirective, NgDocDropdownHandlerDirective],
})
export class NgDocComboboxHostComponent<T>
  extends DIControl<T>
  implements
    NgDocOverlayHost,
    NgDocInputHost<string>,
    DICompareHost<T>,
    NgDocDisplayValueHost<T>,
    NgDocListHost
{
  // `compareFn` and `displayValueFn` stay plain inputs: `DICompareHost` and
  // `NgDocDisplayValueHost` call them as functions.
  /** Compares an option with the value. */
  // eslint-disable-next-line @angular-eslint/prefer-signals -- read as a plain function by DICompareHost
  @Input()
  compareFn: DICompareFunction<T> = DI_DEFAULT_COMPARE;

  /** Turns the value into the text of the field. */
  // eslint-disable-next-line @angular-eslint/prefer-signals -- read as a plain function by NgDocDisplayValueHost
  @Input()
  displayValueFn: NgDocDisplayValueFunction<T> = String;

  readonly positions: NgDocOverlayPosition[] = ['bottom-center', 'top-center'];

  // Not `required`: overlay code may read the origin before this view has rendered.
  private readonly originQuery = viewChild<string, ElementRef<HTMLElement>>('origin', {
    read: ElementRef,
  });
  private readonly dropdownQuery = contentChild(NgDocDropdownComponent);
  private readonly inputQuery = contentChild<NgDocBaseInput<string>>(NgDocBaseInput);

  constructor() {
    super({
      host: injectHostControl({ skipSelf: true, optional: true }),
      onChildControlChange: (control) => {
        if (control instanceof DIStateControl) {
          this.dropdown?.close();
        }
      },
    });

    // Typing in the focused field opens the options.
    effect((onCleanup) => {
      const input: NgDocBaseInput<string> | undefined = this.inputQuery();

      if (input) {
        const subscription = input.changes
          .pipe(filter(() => input.isFocused))
          .subscribe(() => untracked(() => this.dropdown?.open()));

        onCleanup(() => subscription.unsubscribe());
      }
    });
  }

  /** Origin of the dropdown (`NgDocOverlayHost`). */
  get origin(): ElementRef<HTMLElement> | undefined {
    return this.originQuery();
  }

  /** The dropdown with the options. */
  get dropdown(): NgDocDropdownComponent | undefined {
    return this.dropdownQuery();
  }

  /** The text field of the combobox. */
  get inputControl(): NgDocBaseInput<string> | undefined {
    return this.inputQuery();
  }

  get listHostOrigin(): ElementRef<HTMLElement> | undefined {
    return this.inputControl?.elementRef;
  }

  get searchText(): string {
    return this.hasValue ? '' : this.inputControl?.value || '';
  }

  get width(): number {
    return this.origin?.nativeElement.offsetWidth || 0;
  }

  get panelClass(): string {
    return `ng-doc-combobox-host-overlay`;
  }

  /** Opens the dropdown when the field is clicked. */
  clickEvent(): void {
    if (!this.disabled) {
      this.dropdown?.open();
    }
  }
}
