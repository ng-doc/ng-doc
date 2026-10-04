import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DIStateControl, injectHostControl } from 'di-controls';

/**
 * Button that checks its `value` in the host control (for example `ngDocRadioGroup`) when
 * clicked, and unchecks it when clicked again.
 */
@Component({
  selector: '[ng-doc-button-toggle]',
  templateUrl: './button-toggle.component.html',
  styleUrl: './button-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'clickEvent()',
  },
})
export class NgDocButtonToggleComponent<T> extends DIStateControl<T> {
  constructor() {
    super({
      host: injectHostControl(),
    });
  }

  protected clickEvent(): void {
    this.updateModel(this.checked() ? null : this.value);
  }
}
