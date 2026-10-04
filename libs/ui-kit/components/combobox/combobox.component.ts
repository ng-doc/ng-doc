import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  input,
  TemplateRef,
} from '@angular/core';
import { NgDocComboboxHostComponent } from '@ng-doc/ui-kit/cdk/combobox-host';
import { NgDocListHost } from '@ng-doc/ui-kit/classes/list-host';
import { NgDocClearControlComponent } from '@ng-doc/ui-kit/components/clear-control';
import { NgDocDropdownComponent } from '@ng-doc/ui-kit/components/dropdown';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocInputWrapperComponent } from '@ng-doc/ui-kit/components/input-wrapper';
import { NgDocDataDirective } from '@ng-doc/ui-kit/directives/data';
import { NgDocFocusCatcherDirective } from '@ng-doc/ui-kit/directives/focus-catcher';
import { NgDocInputStringDirective } from '@ng-doc/ui-kit/directives/input-string';
import { NgDocContextWithImplicit } from '@ng-doc/ui-kit/interfaces';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';
import { DIControl, provideHostControl } from 'di-controls';

/**
 * A select with an optional text field. Its options are an `ng-doc-list` in a template marked
 * with the `ngDocData` directive.
 */
@Component({
  selector: 'ng-doc-combobox',
  templateUrl: './combobox.component.html',
  styleUrls: ['./combobox.component.scss'],
  providers: [
    provideHostControl(NgDocComboboxComponent),
    {
      provide: NgDocListHost,
      useExisting: NgDocComboboxComponent,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocComboboxHostComponent,
    NgDocInputWrapperComponent,
    NgDocFocusCatcherDirective,
    NgDocInputStringDirective,
    PolymorpheusOutlet,
    NgDocClearControlComponent,
    NgDocDropdownComponent,
    NgDocIconComponent,
    NgTemplateOutlet,
  ],
})
export class NgDocComboboxComponent<T> extends DIControl<T> implements NgDocListHost {
  /** Whether the text field is read-only: the value is picked from the list only. */
  readonly readonly = input<boolean>(false);

  /** Placeholder of the text field. */
  readonly placeholder = input<string>('Chose the value');

  /** Whether the clear button is shown. */
  readonly clearButton = input<boolean>(true);

  /** Content shown at the right of the field. */
  readonly rightContent = input<NgDocContent>('');

  /** Content that shows the value while the field is not being edited. */
  readonly valueContent = input<NgDocContent<NgDocContextWithImplicit<T | null>>>('');

  /** The template of the options, marked with the `ngDocData` directive. */
  readonly data = contentChild(NgDocDataDirective, { read: TemplateRef });

  constructor() {
    super();
  }

  get listHostOrigin(): HTMLElement {
    return this.elementRef.nativeElement;
  }
}
