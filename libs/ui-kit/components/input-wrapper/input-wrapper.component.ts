import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { NgDocBaseInput } from '@ng-doc/ui-kit/classes/base-input';
import { NgDocInputHost } from '@ng-doc/ui-kit/classes/input-host';
import { NgDocFloatedBorderComponent } from '@ng-doc/ui-kit/components/floated-border';
import { NgDocWrapperComponent } from '@ng-doc/ui-kit/components/wrapper';
import { NgDocFocusCatcherDirective } from '@ng-doc/ui-kit/directives/focus-catcher';
import { NgDocContextWithImplicit } from '@ng-doc/ui-kit/interfaces';
import { NgDocContent, NgDocTextAlign } from '@ng-doc/ui-kit/types';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';

/**
 * The frame of a text field: it draws the border and the focus state around an `ngDocInputString`
 * or `ngDocInputNumber` input, holds content at its left and right, and can show `blurContent`
 * instead of the text while the field is not being edited.
 */
@Component({
  selector: 'ng-doc-input-wrapper',
  templateUrl: './input-wrapper.component.html',
  styleUrls: ['./input-wrapper.component.scss'],
  providers: [
    {
      provide: NgDocInputHost,
      useExisting: NgDocInputWrapperComponent,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocWrapperComponent,
    NgDocFocusCatcherDirective,
    NgDocFloatedBorderComponent,
    PolymorpheusOutlet,
  ],
  host: {
    '[attr.data-ng-doc-align]': 'align()',
    '[attr.data-ng-doc-input-disabled]': 'disabled',
  },
})
export class NgDocInputWrapperComponent<T, B = unknown> implements NgDocInputHost<T> {
  readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Content shown instead of the text while the field is not being edited. */
  readonly blurContent = input<NgDocContent<NgDocContextWithImplicit<B | null>>>('');

  /** The `$implicit` context of `blurContent`. */
  readonly blurContext = input<B | null>(null);

  /** Alignment of the text. */
  readonly align = input<NgDocTextAlign>('left');

  /** Focus state of the frame. */
  readonly focusCatcher = viewChild.required(NgDocFocusCatcherDirective);

  private readonly inputQuery = contentChild<NgDocBaseInput<T>>(NgDocBaseInput);

  /** The input in the frame. */
  get input(): NgDocBaseInput<T> | undefined {
    return this.inputQuery();
  }

  /** The input in the frame, as its input host exposes it. */
  get inputControl(): NgDocBaseInput<T> | undefined {
    return this.inputQuery();
  }

  /** Whether the input is disabled. The control keeps it in a signal, so this is reactive. */
  get disabled(): boolean {
    return !!this.inputControl?.disabled;
  }

  /** Whether the input has a value. */
  inputHasValue(): boolean {
    return !!this.inputControl?.hasValue;
  }

  /**
   * Whether `blurContent` is shown: the field is not focused (focus changes re-render the frame
   * through its `focusin`/`focusout` listeners), or it is read-only.
   */
  get blurContentIsVisible(): boolean {
    return !!this.blurContent() && (!this.input?.isFocused || !!this.input?.isReadonly);
  }

  // Focus events only need to trigger change detection of the frame.

  protected emptyEvent(): void {}
}
