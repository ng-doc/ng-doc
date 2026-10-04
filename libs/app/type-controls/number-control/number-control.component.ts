import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgDocTypeControl } from '@ng-doc/app/interfaces';
import {
  NgDocButtonIconComponent,
  NgDocFocusableDirective,
  NgDocIconComponent,
  NgDocInputNumberDirective,
  NgDocInputWrapperComponent,
} from '@ng-doc/ui-kit';
import { DIControl, DIControlSilencerDirective } from 'di-controls';

/** The playground control of `number` inputs. */
@Component({
  selector: 'ng-doc-number-control',
  templateUrl: './number-control.component.html',
  styleUrls: ['./number-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocInputWrapperComponent,
    DIControlSilencerDirective,
    NgDocInputNumberDirective,
    FormsModule,
    NgDocButtonIconComponent,
    NgDocFocusableDirective,
    NgDocIconComponent,
  ],
})
export class NgDocNumberControlComponent
  extends DIControl<number>
  implements NgDocTypeControl<number>
{
  /** Default value of the input; clearing the field returns to it. */
  readonly default = input<number | undefined>(undefined);

  constructor() {
    super();
  }

  changeModel(value: number | null): void {
    const defaultValue: number | undefined = this.default();

    this.updateModel(value === null && defaultValue ? defaultValue : value);
  }
}
