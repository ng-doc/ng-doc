import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
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
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NgDocLabelComponent,
    NgDocInputWrapperComponent,
    NgDocInputStringDirective,
  ],
})
export class FloatingCirclePositionControlComponent
  implements NgDocTypeControl<FloatingCirclePosition>
{
  @Input()
  default: FloatingCirclePosition | undefined;

  model: FormGroup<{
    top: FormControl<string | null>;
    left: FormControl<string | null>;
  }> = new FormGroup({
    top: new FormControl<string>(''),
    left: new FormControl<string>(''),
  });

  touched: () => void = EMPTY_FUNCTION;
  changed: (value: FloatingCirclePosition | null) => void = EMPTY_FUNCTION;

  constructor() {
    this.model.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value: FloatingCirclePosition) => this.changed(value));
  }

  registerOnChange(fn: (value: FloatingCirclePosition | null) => void): void {
    this.changed = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }

  writeValue(obj: FloatingCirclePosition | null): void {
    this.model.patchValue(
      {
        top: null,
        left: null,
        ...(obj ? obj : {}),
      },
      { emitEvent: false },
    );
  }
}
