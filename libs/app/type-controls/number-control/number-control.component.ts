import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
  @Input()
  default?: number;

  constructor() {
    super();
  }

  changeModel(value: number | null): void {
    this.updateModel(value === null && this.default ? this.default : value);
  }
}
