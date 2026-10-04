import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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

/** The playground control of `string` inputs. */
@Component({
  selector: 'ng-doc-string-control',
  templateUrl: './string-control.component.html',
  styleUrls: ['./string-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgDocInputWrapperComponent,
    NgDocInputStringDirective,
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
  /** Default value of the input; clearing the field returns to it. */
  readonly default = input<string | undefined>(undefined);

  constructor() {
    super();
  }

  changeModel(value: string | null): void {
    const defaultValue: string | undefined = this.default();

    this.updateModel(value === null && defaultValue ? defaultValue : value);
  }

  override writeValue(value: string | null) {
    super.writeValue(value);
  }
}
