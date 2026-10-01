import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocTypeControl } from '@ng-doc/app/interfaces';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocCheckboxComponent, NgDocTooltipDirective } from '@ng-doc/ui-kit';
import { DIControl, provideHostControl } from 'di-controls';

/** The playground control of `boolean` inputs: a checkbox labelled with the input name. */
@Component({
  selector: 'ng-doc-boolean-control',
  templateUrl: './boolean-control.component.html',
  styleUrls: ['./boolean-control.component.scss'],
  providers: [provideHostControl(NgDocBooleanControlComponent)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocCheckboxComponent, NgDocTooltipDirective, NgDocSanitizeHtmlPipe],
})
export class NgDocBooleanControlComponent
  extends DIControl<boolean | undefined>
  implements NgDocTypeControl<boolean | undefined>
{
  /** Default value of the input; `undefined` leaves the component's own default. */
  readonly default = input<boolean | undefined>(undefined);

  /** Name of the input. */
  readonly name = input<string>('');

  /** Description of the input, shown in a tooltip. */
  readonly description = input<string>('');

  constructor() {
    super();
  }

  /** The value an unchecked box stands for. */
  get defaultValue(): boolean | undefined {
    return this.default();
  }

  override updateModel(obj: boolean | null | undefined) {
    super.updateModel(obj ? obj : !this.defaultValue ? this.defaultValue : false);
  }
}
