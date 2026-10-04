import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgDocTypeControl } from '@ng-doc/app';
import { EMPTY_FUNCTION } from '@ng-doc/core';
import {
  NgDocInputStringDirective,
  NgDocInputWrapperComponent,
  NgDocLabelComponent,
} from '@ng-doc/ui-kit';

import { FloatingCirclePosition } from '../floating-circle/floating-circle.component';

@Component({
  selector: 'ng-doc-floating-circle-position-control',
  templateUrl: './floating-circle-position-control.component.html',
  styleUrls: ['./floating-circle-position-control.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgDocLabelComponent,
    NgDocInputWrapperComponent,
    NgDocInputStringDirective,
  ],
})
export class FloatingCirclePositionControlComponent
  implements NgDocTypeControl<FloatingCirclePosition>
{
  /** The default value of the input, set by the playground. */
  readonly default = input<FloatingCirclePosition>();

  protected readonly model = new FormGroup({
    top: new FormControl<string | null>(null),
    left: new FormControl<string | null>(null),
  });

  private touched: () => void = EMPTY_FUNCTION;
  private changed: (value: FloatingCirclePosition | null) => void = EMPTY_FUNCTION;

  constructor() {
    this.model.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value: FloatingCirclePosition) => this.changed(value));
  }

  writeValue(value: FloatingCirclePosition | null): void {
    // `null` means no value: show the default of the input.
    this.model.patchValue(
      { top: null, left: null, ...(value ?? this.default()) },
      { emitEvent: false },
    );
  }

  registerOnChange(fn: (value: FloatingCirclePosition | null) => void): void {
    this.changed = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }

  protected blur(): void {
    this.touched();
  }
}
