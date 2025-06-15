import { NgIf } from '@angular/common';
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ElementRef,
  HostBinding,
  Input,
  ViewChild,
} from '@angular/core';
import { NgDocBaseInput } from '@ng-doc/ui-kit/classes/base-input';
import { NgDocInputHost } from '@ng-doc/ui-kit/classes/input-host';
import { NgDocFloatedBorderComponent } from '@ng-doc/ui-kit/components/floated-border';
import { NgDocWrapperComponent } from '@ng-doc/ui-kit/components/wrapper';
import { ngDocMakePure } from '@ng-doc/ui-kit/decorators';
import { NgDocFocusCatcherDirective } from '@ng-doc/ui-kit/directives/focus-catcher';
import { NgDocContextWithImplicit } from '@ng-doc/ui-kit/interfaces';
import { NgDocContent, NgDocTextAlign } from '@ng-doc/ui-kit/types';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';

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
    NgIf,
    PolymorpheusModule,
  ],
})
export class NgDocInputWrapperComponent<T, B = unknown>
  implements AfterViewChecked, NgDocInputHost<T>
{
  @Input()
  blurContent: NgDocContent<NgDocContextWithImplicit<B | null>> = '';

  @Input()
  blurContext: B | null = null;

  @Input()
  @HostBinding('attr.data-ng-doc-align')
  align: NgDocTextAlign = 'left';

  @ContentChild(NgDocBaseInput)
  input?: NgDocBaseInput<T>;

  @ContentChild(NgDocBaseInput)
  inputControl?: NgDocBaseInput<T>;

  @ViewChild(NgDocFocusCatcherDirective, { static: true })
  focusCatcher?: NgDocFocusCatcherDirective;

  constructor(
    public elementRef: ElementRef<HTMLElement>,
    protected changeDetectorRef: ChangeDetectorRef,
  ) {}

  ngAfterViewChecked(): void {
    this.changeDetectorRef.markForCheck();
  }

  @ngDocMakePure
  getBlurContext($implicit: B | null): NgDocContextWithImplicit<B | null> {
    return { $implicit };
  }

  @HostBinding('attr.data-ng-doc-input-disabled')
  get disabled(): boolean {
    return !!this.inputControl?.disabled;
  }

  inputHasValue(): boolean {
    return !!this.inputControl?.hasValue;
  }

  get blurContentIsVisible(): boolean {
    return !!this.blurContent && (!this.input?.isFocused || this.input?.isReadonly);
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  emptyEvent(): void {}
}
