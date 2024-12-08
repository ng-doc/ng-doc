import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgDocTypeControl } from '@ng-doc/app/interfaces';
import {
  NgDocButtonIconComponent,
  NgDocFocusableDirective,
  NgDocIconComponent,
  NgDocInputStringDirective,
  NgDocInputWrapperComponent,
} from '@ng-doc/ui-kit';
import { DIControl, DIControlSilencerDirective } from 'di-controls';

@Component({
  selector: 'ng-doc-string-control',
  templateUrl: './string-control.component.html',
  styleUrls: ['./string-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgDocInputWrapperComponent,
    NgDocInputStringDirective,
    NgIf,
    NgDocButtonIconComponent,
    NgDocFocusableDirective,
    NgDocIconComponent,
    DIControlSilencerDirective,
  ],
})
export class NgDocStringControlComponent
  extends DIControl<string>
  implements NgDocTypeControl<string>
{
  @Input()
  default?: string;

  constructor() {
    super();
  }

  changeModel(value: string | null): void {
    this.updateModel(value === null && this.default ? this.default : value);
  }

  override writeValue(value: string | null) {
    super.writeValue(value);
  }
}
